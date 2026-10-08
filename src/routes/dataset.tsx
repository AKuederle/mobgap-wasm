import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/session";
import { listExamples, loadExample } from "@/lib/examples";
import type { Example } from "@/lib/examples";
import type { DatasetConfiguration } from "@/lib/contracts";
import { Page, ErrorMessage } from "@/components/page";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/dataset")({ component: DatasetPage });
function DatasetPage() {
  const { session } = Route.useRouteContext();
  const state = useSession(session);
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loadingSample, setLoadingSample] = useState(false);
  const exampleRequest = useRef<AbortController | null>(null);
  useEffect(() => () => exampleRequest.current?.abort(), []);
  const samples = useQuery({
    queryKey: ["examples"],
    queryFn: ({ signal }) => listExamples(signal),
    staleTime: 60 * 60 * 1000,
  });
  const form = useForm({
    defaultValues: {
      recording: state.files?.recording as File | undefined,
      split: state.split,
    },
    onSubmit: async ({ value }) => {
      if (!value.recording) return;
      if (value.recording !== state.files?.recording) {
        session.stage({ recording: value.recording }, value.split);
      } else if (value.split !== state.split) {
        session.setSplit(value.split);
      }
      await navigate({ to: "/metadata" });
    },
  });
  async function loadSample(sample: Example) {
    setLoadingSample(true);
    setError("");
    const request = new AbortController();
    exampleRequest.current = request;
    try {
      const files = await loadExample(sample, request.signal);
      if (request.signal.aborted) return;
      session.stage(files, "auto", sample.preset, sample.cohort);
      await navigate({ to: "/metadata" });
    } catch (reason) {
      if (!request.signal.aborted) {
        console.error(reason);
        setError(
          "Could not load this example. Please try again or choose a recording.",
        );
      }
    } finally {
      setLoadingSample(false);
    }
  }
  return (
    <Page
      title="Choose a dataset"
      description="Select one recording, or start with a public example."
    >
      <ErrorMessage>{error}</ErrorMessage>
      <form
        className="max-w-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <FieldGroup>
          <form.Field
            name="recording"
            validators={{
              onChange: ({ value }) =>
                !value
                  ? "Choose a recording."
                  : !/\.(mat|cwa)$/i.test(value.name)
                    ? "Choose a MATLAB (.mat) or CWA (.cwa) recording."
                    : undefined,
            }}
          >
            {(field) => (
              <Field data-invalid={!field.state.meta.isValid}>
                <FieldLabel htmlFor="recording">Recording</FieldLabel>
                <Input
                  id="recording"
                  type="file"
                  accept=".mat,.cwa"
                  disabled={loadingSample}
                  aria-invalid={!field.state.meta.isValid}
                  onChange={(event) => {
                    setError("");
                    field.handleChange(event.target.files?.[0]);
                  }}
                />
                {field.state.value && (
                  <FieldDescription>
                    {field.state.value.name} ·{" "}
                    {(field.state.value.size / 1024 / 1024).toFixed(1)} MB
                  </FieldDescription>
                )}
                {field.state.meta.errors.map((message) => (
                  <p className="text-sm text-destructive" key={String(message)}>
                    {message}
                  </p>
                ))}
              </Field>
            )}
          </form.Field>
          <form.Subscribe selector={(state) => state.values.recording}>
            {(recording) =>
              recording?.name.toLowerCase().endsWith(".cwa") && (
                <form.Field name="split">
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor="split">
                        Organize recording
                      </FieldLabel>
                      <Select
                        value={field.state.value}
                        onValueChange={(value) =>
                          field.handleChange(
                            value as DatasetConfiguration["split"],
                          )
                        }
                      >
                        <SelectTrigger id="split">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="auto">Automatic</SelectItem>
                            <SelectItem value="file">Single file</SelectItem>
                            <SelectItem value="days">
                              Split by calendar day
                            </SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FieldDescription>
                        Automatic splits recordings longer than 24 hours into
                        calendar days.
                      </FieldDescription>
                    </Field>
                  )}
                </form.Field>
              )
            }
          </form.Subscribe>
          <form.Subscribe
            selector={(state) =>
              [state.canSubmit, state.values.recording] as const
            }
          >
            {([canSubmit, recording]) => (
              <Button
                type="submit"
                className="self-start"
                disabled={!canSubmit || !recording || loadingSample}
              >
                Continue to metadata
              </Button>
            )}
          </form.Subscribe>
        </FieldGroup>
      </form>
      <section
        className="mt-3 flex max-w-2xl flex-col gap-3"
        aria-labelledby="examples-heading"
      >
        <h2 id="examples-heading" className="font-semibold">
          Try an example
        </h2>
        {samples.data?.map((sample) => (
          <Button
            key={sample.path}
            variant="outline"
            className="h-auto justify-start py-4 text-left whitespace-normal"
            disabled={loadingSample}
            onClick={() => void loadSample(sample)}
          >
            <span>
              <span className="block">{sample.label}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {sample.metadataPath
                  ? "Recording and participant metadata"
                  : "Recording; participant metadata required"}
              </span>
            </span>
          </Button>
        ))}
        {samples.isError && (
          <p className="text-sm text-muted-foreground">
            Examples are unavailable. You can still select your own recording.
          </p>
        )}
        {loadingSample && (
          <p role="status" className="text-sm">
            Loading example…
          </p>
        )}
      </section>
    </Page>
  );
}
