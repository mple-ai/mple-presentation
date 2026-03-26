export default function DeniedPage() {
  return (
    <div className="flex h-screen items-center justify-center flex-col gap-3">
      <h1 className="text-xl font-semibold">Access Denied</h1>
      <p className="text-muted-foreground text-sm">
        This app can only be accessed through the mple.ai website.
      </p>
    </div>
  );
}
