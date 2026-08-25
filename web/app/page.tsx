export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-50 p-16 font-sans dark:bg-black">
      <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
        update-cv
      </h1>
      <p className="max-w-md text-center text-zinc-600 dark:text-zinc-400">
        Sistema local de generación de CVs a la medida. Este es un placeholder
        de la Fase 0 — las vistas reales (
        <code className="rounded bg-black/[.06] px-1.5 py-0.5 font-mono text-[0.9em] dark:bg-white/[.08]">
          /perfil
        </code>
        ,{" "}
        <code className="rounded bg-black/[.06] px-1.5 py-0.5 font-mono text-[0.9em] dark:bg-white/[.08]">
          /nueva-aplicacion
        </code>
        ,{" "}
        <code className="rounded bg-black/[.06] px-1.5 py-0.5 font-mono text-[0.9em] dark:bg-white/[.08]">
          /aplicaciones
        </code>
        ) se construyen en las fases siguientes.
      </p>
    </div>
  );
}
