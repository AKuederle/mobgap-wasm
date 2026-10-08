// Adapted from @shadcn-space/stepper-01. Routes own step state and page content.
import {
  Check,
  File,
  ListChecks,
  Play,
  User,
  ChartNoAxesCombined,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SessionState } from "@/lib/session";
const steps = [
  { path: "/dataset", title: "Dataset", icon: File },
  { path: "/metadata", title: "Metadata", icon: User },
  { path: "/select", title: "Recordings", icon: ListChecks },
  { path: "/running", title: "Running", icon: Play },
  { path: "/results", title: "Results", icon: ChartNoAxesCombined },
] as const;
export default function Stepper({
  pathname,
  state,
  onNavigate,
}: {
  pathname: string;
  state: SessionState;
  onNavigate: (to: (typeof steps)[number]["path"]) => void;
}) {
  const activeStep = steps.findIndex((step) => step.path === pathname);
  const available = [
    true,
    !!state.files,
    !!state.configuration,
    state.running || state.jobRows.length > 0,
    !state.running && state.jobRows.length > 0,
  ];
  return (
    <nav
      aria-label="Analysis steps"
      className="relative mt-7 flex justify-between gap-1"
    >
      <div className="absolute top-[18px] right-[10%] left-[10%] h-0.5 bg-border" />
      <div
        className="absolute top-[18px] right-[10%] left-[10%] h-0.5 origin-left bg-primary transition-transform"
        style={{
          transform: `scaleX(${Math.max(0, activeStep) / (steps.length - 1)})`,
        }}
      />
      {steps.map((step, index) => (
        <button
          key={step.path}
          type="button"
          disabled={!available[index]}
          aria-current={index === activeStep ? "step" : undefined}
          onClick={() => onNavigate(step.path)}
          className="relative flex flex-1 flex-col items-center gap-3 rounded-md text-center outline-offset-4 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span
            className={cn(
              "flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground",
              index <= activeStep &&
                "rounded-full bg-primary text-primary-foreground",
            )}
          >
            {index < activeStep ? (
              <Check className="size-4" />
            ) : (
              <step.icon className="size-4" />
            )}
          </span>
          <span
            className={cn(
              "text-xs sm:text-sm",
              index === activeStep && "font-semibold",
            )}
          >
            {step.title}
          </span>
        </button>
      ))}
    </nav>
  );
}
