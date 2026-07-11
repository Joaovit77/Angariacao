/* ================================================================
   ESQUELETO DE CARREGAMENTO
   Mostrado no <main> enquanto carregarEstado() não termina, no lugar
   do antigo texto "Carregando seus dados...". Blocos com shimmer no
   formato aproximado do Dashboard, para dar sensação de rapidez.
   ================================================================ */
export default function EsqueletoPainel() {
  return (
    <div className="view-anim" role="status" aria-label="Carregando seus dados">
      <div className="skeleton skel-title" />
      <div className="skel-grid" style={{ marginBottom: "16px" }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton skel-card" />
        ))}
      </div>
      <div className="skel-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="skeleton" style={{ height: "260px" }} />
        <div className="skeleton" style={{ height: "260px" }} />
      </div>
    </div>
  );
}
