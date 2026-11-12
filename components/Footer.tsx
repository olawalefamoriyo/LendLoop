export function Footer() {
  return (
    <footer className="border-t border-stone-200/80 py-8 text-center text-sm text-stone-400">
      LendLoop · a neighborhood tool library · {new Date().getFullYear()}
    </footer>
  );
}
