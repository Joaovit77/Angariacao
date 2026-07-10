/* ================================================================
   Placeholder das views ainda não portadas. Some na Etapa 5, quando
   cada rota ganha a view real (MIGRATION_NEXT.md §6).
   ================================================================ */

export default function PaginaEmMigracao({ titulo }: { titulo: string }) {
  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">{titulo}</div>
          <div className="page-sub">Em migração — Etapa 5.</div>
        </div>
      </div>
      <div className="empty-state">
        <h3>Em migração</h3>
        <p>Esta view será portada do app antigo na Etapa 5 da migração.</p>
      </div>
    </>
  );
}
