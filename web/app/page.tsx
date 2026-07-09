// Página placeholder da Etapa 1 (MIGRATION_NEXT.md) — existe apenas para
// provar que a fundação funciona: build, TypeScript e o style.css global
// (tokens em :root) aplicados. Será substituída pelo shell autenticado
// na Etapa 4.
export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <section
        style={{
          background: "var(--bg-elev-1)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "32px 40px",
          maxWidth: "520px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontFamily: "var(--font-display)",
            color: "var(--accent-strong)",
            fontSize: "28px",
            marginBottom: "8px",
          }}
        >
          Painel de Angariações
        </h1>
        <p style={{ color: "var(--text-dim)" }}>
          Fundação Next.js (Etapa 1 da migração) — tokens de design do
          app original carregados via CSS global.
        </p>
      </section>
    </main>
  );
}
