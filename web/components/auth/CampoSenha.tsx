"use client";

/* ================================================================
   Campo de senha com botão de mostrar/ocultar e (opcionalmente) o
   medidor de força. Port de togglePasswordVisibility() e
   updatePasswordStrength() do app.js — a barra só aparece quando há
   algo digitado, exatamente como no original.
   ================================================================ */
import { useState } from "react";
import { forcaSenha } from "@/lib/auth/forcaSenha";

interface Props {
  value: string;
  onChange: (valor: string) => void;
  placeholder: string;
  autoComplete: string;
  minLength?: number;
  comForca?: boolean;
}

export default function CampoSenha({
  value,
  onChange,
  placeholder,
  autoComplete,
  minLength,
  comForca = false,
}: Props) {
  const [visivel, setVisivel] = useState(false);
  const forca = forcaSenha(value);

  return (
    <>
      <div className="input-icon-wrap">
        <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="11" width="18" height="10" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <input
          type={visivel ? "text" : "password"}
          required
          placeholder={placeholder}
          autoComplete={autoComplete}
          minLength={minLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className={`input-icon-btn${visivel ? " active" : ""}`}
          onClick={() => setVisivel((v) => !v)}
          tabIndex={-1}
        >
          <svg className="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </div>
      {comForca && value && (
        <div className="pw-strength" style={{ display: "flex" }}>
          <div className="pw-strength-track">
            <div
              className="pw-strength-fill"
              style={{ width: `${forca.pct}%`, background: forca.color }}
            />
          </div>
          <span className="pw-strength-label" style={{ color: forca.color }}>
            {forca.label}
          </span>
        </div>
      )}
    </>
  );
}
