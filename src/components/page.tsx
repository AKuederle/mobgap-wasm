import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
export function Page({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-7">
      <header className="page-intro">
        <h1>{title}</h1>
        {description && <p className="intro-copy">{description}</p>}
      </header>
      {children}
    </div>
  );
}
export function ErrorMessage({ children }: { children: ReactNode }) {
  return children ? (
    <Alert variant="destructive">
      <AlertTitle>Could not continue</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  ) : null;
}
