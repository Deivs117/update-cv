import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-50 p-16 font-sans dark:bg-black">
      <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
        update-cv
      </h1>
      <p className="max-w-md text-center text-zinc-600 dark:text-zinc-400">
        Sistema local de generación de CVs a la medida.
      </p>
      <nav className="flex flex-col gap-2 text-center sm:flex-row sm:gap-4">
        <Link
          href="/perfil"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Editor de perfil
        </Link>
        <Link
          href="/nueva-aplicacion"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Nueva aplicación (Fase 4)
        </Link>
        <Link
          href="/aplicaciones"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Historial (Fase 7)
        </Link>
      </nav>
    </div>
  );
}
