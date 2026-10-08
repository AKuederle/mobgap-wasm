import {
  createFileRoute,
  redirect,
  Link,
  useNavigate,
} from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { useSession } from "@/lib/session";
import { Page } from "@/components/page";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const timezones = [
  ...new Set([
    "UTC",
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    ...Intl.supportedValuesOf("timeZone"),
  ]),
].sort();
export const Route = createFileRoute("/metadata")({
  beforeLoad: ({ context }) => {
    if (!context.session.getSnapshot().files)
      throw redirect({ to: "/dataset" });
  },
  component: MetadataPage,
});
function MetadataPage() {
  const { session } = Route.useRouteContext();
  const state = useSession(session);
  const navigate = useNavigate();
  const isCwa = state.files!.recording.name.toLowerCase().endsWith(".cwa");
  const metadata = state.files?.metadata;
  const [fileError, setFileError] = useState("");
  const form = useForm({
    defaultValues: state.draft,
    listeners: {
      onChange: ({ formApi }) => session.draft(formApi.state.values),
    },
    onSubmit: async ({ value }) => {
      if (!isCwa && value.mode === "file" && !metadata) {
        setFileError("Choose the participant metadata file.");
        return;
      }
      session.configure(
        {
          format: isCwa ? "cwa" : "mat",
          split: state.split,
          cohort: value.cohort,
          measurementCondition: value.condition,
          ...(isCwa ? { timezone: value.timezone } : {}),
          ...(value.mode === "manual"
            ? {
                participantHeightM: Number(value.participantHeight),
                sensorHeightM: Number(value.sensorHeight),
              }
            : {}),
        },
        value.mode === "file" ? metadata : undefined,
      );
      await navigate({ to: "/select" });
    },
  });
  return (
    <Page
      title="Participant metadata"
      description={state.files!.recording.name}
    >
      <form
        className="max-w-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <FieldGroup>
          {!isCwa && (
            <form.Field name="mode">
              {(field) => (
                <Field>
                  <FieldLabel id="metadata-source-label">
                    Participant measurements
                  </FieldLabel>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    aria-labelledby="metadata-source-label"
                    value={field.state.value}
                    onValueChange={(value) => {
                      if (value) field.handleChange(value as "manual" | "file");
                    }}
                  >
                    <ToggleGroupItem value="file">
                      From metadata file
                    </ToggleGroupItem>
                    <ToggleGroupItem value="manual">
                      Enter manually
                    </ToggleGroupItem>
                  </ToggleGroup>
                </Field>
              )}
            </form.Field>
          )}
          <form.Subscribe selector={(state) => state.values.mode}>
            {(mode) =>
              mode === "file" && !isCwa ? (
                <Field data-invalid={!!fileError}>
                  <FieldLabel htmlFor="metadata-file">
                    Participant metadata file
                  </FieldLabel>
                  <Input
                    id="metadata-file"
                    type="file"
                    accept=".mat"
                    onChange={(event) => {
                      session.metadata(event.target.files?.[0]);
                      setFileError("");
                    }}
                    aria-invalid={!!fileError}
                  />
                  <FieldDescription>
                    {metadata?.name ??
                      "Select the separate infoForAlgo MATLAB file."}
                  </FieldDescription>
                  {fileError && (
                    <p className="text-sm text-destructive">{fileError}</p>
                  )}
                </Field>
              ) : (
                <>
                  <form.Field
                    name="participantHeight"
                    validators={{
                      onChange: ({ value }) =>
                        !Number.isFinite(Number(value)) || Number(value) <= 0
                          ? "Enter a positive height in metres."
                          : undefined,
                    }}
                  >
                    {(field) => (
                      <Field data-invalid={!field.state.meta.isValid}>
                        <FieldLabel htmlFor="height">
                          Participant height (m)
                        </FieldLabel>
                        <Input
                          id="height"
                          inputMode="decimal"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
                          aria-invalid={!field.state.meta.isValid}
                        />
                        {field.state.meta.errors.map((error) => (
                          <p
                            className="text-sm text-destructive"
                            key={String(error)}
                          >
                            {error}
                          </p>
                        ))}
                      </Field>
                    )}
                  </form.Field>
                  <form.Field
                    name="sensorHeight"
                    validators={{
                      onChangeListenTo: ["participantHeight"],
                      onChange: ({ value, fieldApi }) =>
                        !Number.isFinite(Number(value)) || Number(value) <= 0
                          ? "Enter a positive height in metres."
                          : Number(value) >
                              Number(
                                fieldApi.form.getFieldValue(
                                  "participantHeight",
                                ),
                              )
                            ? "Sensor height cannot exceed participant height."
                            : undefined,
                    }}
                  >
                    {(field) => (
                      <Field data-invalid={!field.state.meta.isValid}>
                        <FieldLabel htmlFor="sensor-height">
                          Sensor height (m)
                        </FieldLabel>
                        <Input
                          id="sensor-height"
                          inputMode="decimal"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
                          aria-invalid={!field.state.meta.isValid}
                        />
                        {field.state.meta.errors.map((error) => (
                          <p
                            className="text-sm text-destructive"
                            key={String(error)}
                          >
                            {error}
                          </p>
                        ))}
                      </Field>
                    )}
                  </form.Field>
                </>
              )
            }
          </form.Subscribe>
          <form.Field
            name="cohort"
            validators={{
              onChange: ({ value }) =>
                !value ? "Select a cohort." : undefined,
            }}
          >
            {(field) => (
              <Field data-invalid={!field.state.meta.isValid}>
                <FieldLabel htmlFor="cohort">Cohort</FieldLabel>
                <Select
                  value={field.state.value}
                  onValueChange={field.handleChange}
                >
                  <SelectTrigger
                    id="cohort"
                    aria-invalid={!field.state.meta.isValid}
                  >
                    <SelectValue placeholder="Select cohort" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {["HA", "COPD", "CHF", "PD", "MS", "PFF"].map(
                        (cohort) => (
                          <SelectItem key={cohort} value={cohort}>
                            {cohort}
                          </SelectItem>
                        ),
                      )}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {field.state.meta.errors.map((error) => (
                  <p className="text-sm text-destructive" key={String(error)}>
                    {error}
                  </p>
                ))}
              </Field>
            )}
          </form.Field>
          <form.Field name="condition">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="condition">Recording setting</FieldLabel>
                <Select
                  value={field.state.value}
                  onValueChange={(value) =>
                    field.handleChange(value as "laboratory" | "free_living")
                  }
                >
                  <SelectTrigger id="condition">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="laboratory">Laboratory</SelectItem>
                      <SelectItem value="free_living">Free living</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            )}
          </form.Field>
          {isCwa && (
            <form.Field
              name="timezone"
              validators={{
                onChange: ({ value }) =>
                  !timezones.includes(value)
                    ? "Select the timezone used to synchronize the sensor."
                    : undefined,
              }}
            >
              {(field) => (
                <Field data-invalid={!field.state.meta.isValid}>
                  <FieldLabel htmlFor="timezone">
                    Sensor synchronization timezone
                  </FieldLabel>
                  <Combobox
                    items={timezones}
                    value={field.state.value || null}
                    onValueChange={(value) => field.handleChange(value ?? "")}
                  >
                    <ComboboxInput
                      id="timezone"
                      placeholder="Search timezones…"
                      aria-invalid={!field.state.meta.isValid}
                      onBlur={field.handleBlur}
                    />
                    <ComboboxContent>
                      <ComboboxEmpty>No matching timezone.</ComboboxEmpty>
                      <ComboboxList>
                        {(zone: string) => (
                          <ComboboxItem key={zone} value={zone}>
                            {zone}
                          </ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                  <FieldDescription>
                    Choose the timezone of the computer that last synchronized
                    the sensor.
                  </FieldDescription>
                  {field.state.meta.errors.map((error) => (
                    <p className="text-sm text-destructive" key={String(error)}>
                      {error}
                    </p>
                  ))}
                </Field>
              )}
            </form.Field>
          )}
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" asChild>
              <Link to="/dataset">Back</Link>
            </Button>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(submitting) => (
                <Button type="submit" disabled={submitting}>
                  Build dataset
                </Button>
              )}
            </form.Subscribe>
          </div>
        </FieldGroup>
      </form>
    </Page>
  );
}
