/* ================================================================
   VITRINE / APRESENTAÇÃO DO SISTEMA
   Port literal das linhas 21–64 do index.html — mesmos textos,
   mesmos ícones, mesma ordem. Conteúdo estático (Server Component).
   ================================================================ */
import Image from "next/image";

export default function Vitrine() {
  return (
    <section className="auth-showcase">
      <div className="brand auth-showcase-brand">
        <Image className="brand-mark" src="/logo.png" alt="Angariações" width={52} height={52} />
        <div className="brand-text">
          <span className="brand-title">Angariações</span>
          <span className="brand-sub">Controle de Locação</span>
        </div>
      </div>

      <h1 className="showcase-headline">
        Toda a sua angariação de locação <span className="hl">em um só lugar.</span>
      </h1>
      <p className="showcase-sub">
        Do primeiro contato com o proprietário até o imóvel locado — organize o funil, acompanhe
        metas e feche mais negócios sem perder nenhum follow-up.
      </p>

      <ul className="showcase-features">
        <li className="showcase-feature">
          <span className="showcase-feature-ic">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="6" height="18" rx="1" />
              <rect x="10" y="3" width="6" height="12" rx="1" />
              <rect x="17" y="3" width="4" height="8" rx="1" />
            </svg>
          </span>
          <span className="showcase-feature-txt">
            <strong>Funil visual (Kanban &amp; Lista)</strong>Acompanhe cada imóvel do primeiro
            contato até o &quot;Locado&quot;, com filtros por coluna.
          </span>
        </li>
        <li className="showcase-feature">
          <span className="showcase-feature-ic">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
          </span>
          <span className="showcase-feature-txt">
            <strong>Agenda inteligente</strong>Lembretes automáticos de retorno e de verificar
            disponibilidade — nada cai no esquecimento.
          </span>
        </li>
        <li className="showcase-feature">
          <span className="showcase-feature-ic">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3v18h18" />
              <path d="M7 15l4-4 3 3 5-6" />
            </svg>
          </span>
          <span className="showcase-feature-txt">
            <strong>Dashboard, metas &amp; comissão</strong>KPIs, metas mensais e comissão estimada
            dos imóveis locados num só olhar.
          </span>
        </li>
        <li className="showcase-feature">
          <span className="showcase-feature-ic">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11z" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
          </span>
          <span className="showcase-feature-txt">
            <strong>Mapa da carteira</strong>Veja seus imóveis distribuídos no mapa por bairro e
            região.
          </span>
        </li>
        <li className="showcase-feature">
          <span className="showcase-feature-ic">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
              <path d="M14 3v6h6M9 14h6M9 17h6" />
            </svg>
          </span>
          <span className="showcase-feature-txt">
            <strong>Relatórios em PDF</strong>Relatórios semanais e mensais com cara de documento,
            prontos pra imprimir e prestar contas.
          </span>
        </li>
        <li className="showcase-feature">
          <span className="showcase-feature-ic">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18h6M10 22h4" />
              <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z" />
            </svg>
          </span>
          <span className="showcase-feature-txt">
            <strong>Insights automáticos</strong>O sistema aponta gargalos do funil e imóveis parados
            que precisam de ação.
          </span>
        </li>
      </ul>

      <div className="showcase-foot">
        <span className="showcase-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          Dados isolados por conta
        </span>
        <span className="showcase-foot-note">Feito para corretores e imobiliárias.</span>
      </div>
    </section>
  );
}
