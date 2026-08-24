import { ImageResponse } from "next/og";

export function criarImagemSocial() {
  return new ImageResponse(
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        overflow: "hidden",
        background: "linear-gradient(135deg, #07100c 0%, #101d18 58%, #1a2119 100%)",
        color: "#f7f4e9",
        fontFamily: "sans-serif",
        padding: "58px 64px",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 460,
          height: 460,
          right: -160,
          top: -210,
          display: "flex",
          borderRadius: 999,
          border: "1px solid rgba(227, 195, 104, .28)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 320,
          height: 320,
          left: -180,
          bottom: -210,
          display: "flex",
          borderRadius: 999,
          background: "rgba(227, 195, 104, .08)",
        }}
      />

      <div
        style={{
          position: "relative",
          width: "58%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          paddingRight: 44,
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              width: 58,
              height: 58,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 16,
              background: "linear-gradient(145deg, #f0d789, #b88419)",
              color: "#07100c",
              fontSize: 38,
              fontWeight: 900,
              marginRight: 16,
            }}
          >
            A
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.4 }}>Angariação</span>
            <span
              style={{
                marginTop: 4,
                color: "#d6cda9",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: 2.1,
              }}
            >
              INTELIGÊNCIA IMOBILIÁRIA
            </span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <span
            style={{
              alignSelf: "flex-start",
              padding: "8px 14px",
              border: "1px solid rgba(227, 195, 104, .42)",
              borderRadius: 999,
              color: "#e3c368",
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: 1.7,
            }}
          >
            CRM DE CAPTAÇÃO PARA LOCAÇÃO
          </span>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: 22,
              fontSize: 62,
              fontWeight: 850,
              lineHeight: 1.02,
              letterSpacing: -2.4,
            }}
          >
            <span>Sua carteira,</span>
            <span style={{ color: "#e3c368" }}>em movimento.</span>
          </div>
          <p
            style={{
              width: 590,
              margin: "20px 0 0",
              color: "#c9cfca",
              fontSize: 22,
              lineHeight: 1.42,
            }}
          >
            Contatos, WhatsApp e próximas ações organizados em um só lugar.
          </p>
        </div>
      </div>

      <div
        style={{
          position: "relative",
          width: "42%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            padding: 24,
            border: "1px solid rgba(255,255,255,.16)",
            borderRadius: 26,
            background: "rgba(247, 244, 233, .95)",
            color: "#17221d",
            boxShadow: "0 28px 70px rgba(0,0,0,.36)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: 1.2 }}>PAINEL / HOJE</span>
            <span style={{ color: "#3d8d65", fontSize: 13, fontWeight: 800 }}>● operação ativa</span>
          </div>
          <div style={{ display: "flex", marginTop: 24 }}>
            <div
              style={{
                width: "48%",
                display: "flex",
                flexDirection: "column",
                padding: "18px 16px",
                borderRadius: 16,
                background: "#e8ece6",
                marginRight: 12,
              }}
            >
              <span style={{ color: "#6a746e", fontSize: 13, fontWeight: 700 }}>NA CARTEIRA</span>
              <strong style={{ marginTop: 7, fontSize: 34 }}>177</strong>
            </div>
            <div
              style={{
                width: "48%",
                display: "flex",
                flexDirection: "column",
                padding: "18px 16px",
                borderRadius: 16,
                background: "#e8ece6",
              }}
            >
              <span style={{ color: "#6a746e", fontSize: 13, fontWeight: 700 }}>RESPOSTAS NOVAS</span>
              <strong style={{ marginTop: 7, fontSize: 34, color: "#9a6b0b" }}>8</strong>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: 14,
              padding: "20px 18px",
              borderRadius: 16,
              background: "#111c17",
              color: "#f7f4e9",
            }}
          >
            <span style={{ color: "#e3c368", fontSize: 12, fontWeight: 800, letterSpacing: 1.5 }}>
              PRÓXIMA AÇÃO
            </span>
            <strong style={{ marginTop: 10, fontSize: 24 }}>3 respostas esperando você</strong>
            <span style={{ marginTop: 9, color: "#b7c0ba", fontSize: 15 }}>
              O outro lado já fez a parte dele.
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", marginTop: 17 }}>
            <span
              style={{
                width: 10,
                height: 10,
                display: "flex",
                borderRadius: 10,
                background: "#e3c368",
                marginRight: 9,
              }}
            />
            <span style={{ color: "#606b65", fontSize: 14, fontWeight: 700 }}>
              Cada oportunidade com uma próxima ação clara
            </span>
          </div>
        </div>
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}
