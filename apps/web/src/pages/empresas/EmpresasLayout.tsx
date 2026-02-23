export default function EmpresasLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-screen-2xl mr-auto px-4 sm:px-6 py-6">
      {children}
    </div>
  );
}
