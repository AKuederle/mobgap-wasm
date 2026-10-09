import type { DatasetIndex, DatasetRow } from "../../src/lib/contracts";
import type { RuntimeMessage, RuntimeRequest } from "./protocol";
import { initialize, mountInputs } from "./wasm";

const send = (message: RuntimeMessage) => postMessage(message);
const pythonJson = (value: unknown) =>
  `json.loads(${JSON.stringify(JSON.stringify(value))})`;
const pythonPath = (value?: string) => (value ? JSON.stringify(value) : "None");

self.onmessage = async (message: MessageEvent<RuntimeRequest>) => {
  let index: DatasetIndex | undefined;
  const output = (text: string) => {
    if (text.startsWith("__MOBGAP_RESULT__"))
      index = JSON.parse(text.slice("__MOBGAP_RESULT__".length));
    else if (text.startsWith("__MOBGAP_EVENT__"))
      send({
        type: "event",
        event: JSON.parse(text.slice("__MOBGAP_EVENT__".length)),
      });
  };
  try {
    const request = message.data;
    const { kernel, environment } = await initialize(output, (text) =>
      send({ type: "log", text }),
    );
    const inputs = mountInputs(kernel, request.file, request.metadata);
    try {
      kernel.exec(
        `print('__MOBGAP_RESULT__' + json.dumps(api.load_index(${pythonPath(inputs.file)}, ${pythonPath(inputs.metadata)}, ${pythonJson(request.configuration)}, validate_metadata=${request.command === "run" ? "True" : "False"}), allow_nan=False))`,
      );
      if (!index) throw new Error("Python did not return a dataset index.");
      send({ type: "index", index, environment });
      if (request.command === "run") {
        if (!index.rows.length)
          throw new Error("The file contains no recordings to process.");
        const numbers = request.recordings?.length
          ? [...new Set(request.recordings)].sort((a, b) => a - b)
          : index.rows.map((_, number) => number + 1);
        const selected: DatasetRow[] = numbers.map((number) => {
          const row = index!.rows[number - 1];
          if (!row)
            throw new Error(
              `Recording ${number} does not exist. Use list-recordings to inspect the ${index!.rows.length} available rows.`,
            );
          return row;
        });
        kernel.exec(
          `api.process(${pythonPath(inputs.file)}, ${pythonPath(inputs.metadata)}, ${pythonJson(request.configuration)}, ${pythonJson(selected)}, ${JSON.stringify(request.preset)})`,
        );
      }
    } finally {
      inputs.close();
    }
    send({ type: "done" });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String((error as { err?: unknown })?.err ?? error);
    send({ type: "error", message });
  }
};
