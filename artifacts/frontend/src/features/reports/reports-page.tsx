import ReportSubmissionForm from "./report-submission-form";

export default function ReportsPage() {
  const params = new URLSearchParams(window.location.search);

  const targetType = params.get("targetType") ?? "";
  const targetId = params.get("targetId") ?? "";
  const initialCategory = params.get("category") ?? "";
  const initialDescription = params.get("description") ?? "";

  const hasTargetContext = Boolean(targetType && targetId);

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold">
            How can we help?
          </h1>

          <p className="mt-2 text-sm text-muted-foreground">
            Help us improve QueueLess by reporting an issue or problem you
            encountered.
          </p>
        </div>

        <ReportSubmissionForm
          initialTargetType={targetType}
          initialTargetId={targetId}
          initialCategory={initialCategory}
          initialDescription={initialDescription}
          lockTarget={hasTargetContext}
        />
      </div>
    </main>
  );
}