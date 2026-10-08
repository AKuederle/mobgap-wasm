"""Stateless browser operations using native mobgap datasets and full pipelines."""

from __future__ import annotations

import gc
import json
import math
import sys
import time
from pathlib import Path
from typing import Any

import pandas as pd
from mobgap.data import AX6Dataset, GenericMobilisedDataset
from mobgap.data.ax6 import split_by_local_days
from mobgap.pipeline import MobilisedPipelineHealthy, MobilisedPipelineImpaired, MobilisedPipelineUniversal
from tpcp.caching import hybrid_cache


def _metadata(configuration: dict[str, Any], source: dict[str, Any] | None = None) -> dict[str, Any]:
    metadata = dict(source or {})
    metadata["cohort"] = configuration["cohort"]
    for option, key in (("participantHeightM", "height_m"), ("sensorHeightM", "sensor_height_m")):
        if configuration.get(option) is not None:
            metadata[key] = configuration[option]
    for key, label in (("height_m", "Participant height"), ("sensor_height_m", "Sensor height")):
        value = metadata.get(key)
        if not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
            raise ValueError(f"{label} must be a positive finite value in metres.")
    if metadata["sensor_height_m"] > metadata["height_m"]:
        raise ValueError("Sensor height must not exceed participant height.")
    return metadata


def _dataset(path: str, metadata_path: str | None, configuration: dict[str, Any]):
    if configuration["format"] == "mat":
        return GenericMobilisedDataset(
            Path(path),
            participant_metadata_override=Path(metadata_path) if metadata_path else _metadata(configuration),
            measurement_condition=configuration["measurementCondition"],
        ), "file"
    dataset = AX6Dataset(
        Path(path),
        participant_metadata=_metadata(configuration),
        recording_metadata={"measurement_condition": configuration["measurementCondition"]},
        tz=configuration["timezone"],
        output_timezone="local",
    )
    split = configuration["split"]
    if split == "auto":
        bounds = dataset.index.iloc[0]
        split = "days" if (bounds.end_time - bounds.start_time).total_seconds() > 86400 else "file"
    if split == "days":
        dataset = dataset.clone().set_params(splitter=split_by_local_days, subset_index=None)
    return dataset, split


def _row(values: dict[str, Any]) -> dict[str, Any]:
    index = {str(key): str(value) for key, value in values.items()}
    return {
        "id": json.dumps(index, sort_keys=True, separators=(",", ":")),
        "index": index,
        "label": " / ".join(value for key, value in index.items() if key != "file_path"),
    }


def load_index(path: str, metadata_path: str | None, configuration: dict[str, Any]) -> dict[str, Any]:
    """Construct a dataset and return its actual index values without retaining it."""
    try:
        dataset, split = _dataset(path, metadata_path, configuration)
        rows = [_row(values) for values in dataset.index.to_dict(orient="records")]
        if metadata_path and configuration["format"] == "mat":
            # Validate the companion with the dataset's own unit conversion and lookup.
            for datapoint in dataset:
                _metadata(configuration, datapoint.participant_metadata)
        return {"rows": rows, "split": split}
    finally:
        # Pinned tpcp keeps native dataset RAM caches in this shared registry.
        hybrid_cache.__cache_registry__.clear()
        gc.collect()


def _table(frame: pd.DataFrame) -> dict[str, Any]:
    flat = frame.drop(columns=["rule_obj"], errors="ignore").reset_index()
    return {
        "columns": [" / ".join(map(str, name)) if isinstance(name, tuple) else str(name) for name in flat.columns],
        "rows": json.loads(flat.to_json(orient="values", date_format="iso", double_precision=15)),
    }


def _analyze(datapoint: Any, row_id: str, preset: str) -> dict[str, Any]:
    if preset == "auto":
        pipeline = MobilisedPipelineUniversal(
            pipelines=[
                ("healthy", MobilisedPipelineHealthy(retain_intermediate_results=False)),
                ("impaired", MobilisedPipelineImpaired(retain_intermediate_results=False)),
            ]
        )
    else:
        pipeline_class = MobilisedPipelineHealthy if preset == "healthy" else MobilisedPipelineImpaired
        pipeline = pipeline_class(retain_intermediate_results=False)
    started = time.perf_counter()
    frame = datapoint.data_ss
    if not all(column in frame for column in ("acc_x", "acc_y", "acc_z", "gyr_x", "gyr_y", "gyr_z")):
        raise ValueError("A LowerBack sensor with all three acceleration and gyroscope axes is required.")
    samples = len(frame)
    del frame
    sampling_rate = float(datapoint.sampling_rate_hz)
    pipeline.run(datapoint)
    attributes = {
        "gait_sequences": "gs_list_",
        "initial_contacts": "raw_ic_list_",
        "turns": "raw_turn_list_",
        "per_second_parameters": "raw_per_sec_parameters_",
        "raw_per_stride_parameters": "raw_per_stride_parameters_",
        "per_stride_parameters": "per_stride_parameters_",
        "walking_bouts": "per_wb_parameters_",
        "aggregated_parameters": "aggregated_parameters_",
    }
    return {
        "recordingId": row_id,
        "preset": getattr(pipeline, "pipeline_name_", preset),
        "summary": {
            "samples": samples,
            "durationSeconds": samples / sampling_rate,
            "samplingRateHz": sampling_rate,
            "gaitSequences": len(pipeline.gs_list_),
            "initialContacts": len(pipeline.raw_ic_list_),
            "walkingBouts": len(pipeline.per_wb_parameters_),
            "strides": len(pipeline.per_stride_parameters_),
            "processingSeconds": time.perf_counter() - started,
        },
        "tables": {name: _table(getattr(pipeline, attribute)) for name, attribute in attributes.items()},
    }


def _emit(event: dict[str, Any]) -> None:
    print("__MOBGAP_EVENT__" + json.dumps(event, allow_nan=False), flush=True)


def _memory_error(error: BaseException) -> MemoryError | None:
    # Scientific transformer helpers can wrap an allocation failure.
    while error is not None:
        if isinstance(error, MemoryError):
            return error
        error = error.__cause__ if error.__cause__ is not None else error.__context__
    return None


def process(
    path: str,
    metadata_path: str | None,
    configuration: dict[str, Any],
    selected_rows: list[dict[str, Any]],
    preset: str,
) -> None:
    """Reconstruct the dataset and emit each selected row's progress and result.

    Ordinary row errors allow subsequent rows to run. MemoryError propagates so
    the caller can replace the worker while keeping results already emitted.
    """
    try:
        dataset, _split = _dataset(path, metadata_path, configuration)
        index_rows = [_row(values)["index"] for values in dataset.index.to_dict(orient="records")]
        for row in selected_rows:
            _emit({"rowId": row["id"], "status": "running"})
            datapoint = None
            try:
                datapoint = dataset[index_rows.index(row["index"])]
                if configuration["format"] == "mat":
                    datapoint = datapoint.clone().set_params(
                        participant_metadata_override=_metadata(configuration, datapoint.participant_metadata)
                    )
                result = _analyze(datapoint, row["id"], preset)
            except Exception as error:  # noqa: BLE001 - report scientific pipeline failures per row.
                memory_error = _memory_error(error)
                if memory_error is not None:
                    _emit({"rowId": row["id"], "status": "error", "message": "Not enough memory to process this row."})
                    raise memory_error from None
                print(f"{type(error).__name__}: {error}", file=sys.stderr, flush=True)
                _emit({"rowId": row["id"], "status": "error", "message": "This row could not be processed. Check the sensor data and participant details, then retry."})
            else:
                _emit({"rowId": row["id"], "status": "complete", "result": result})
                del result
            finally:
                del datapoint
                gc.collect()
    finally:
        # Release native dataset RAM caches after successful and failed operations.
        hybrid_cache.__cache_registry__.clear()
        gc.collect()
