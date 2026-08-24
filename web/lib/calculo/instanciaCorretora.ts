/* ================================================================
   WHATSAPP FIXO DA CORRETORA — identidade, não credencial

   O nome é parte do contrato: cair, reconectar ou ser recriada nunca
   muda a identidade da instância. O número original fica separado da
   forma normalizada para não perder o que foi informado nem inventar
   o nono dígito que não veio na fonte.
   ================================================================ */

export const INSTANCIA_CORRETORA = "corretora";
export const NUMERO_CORRETORA_ORIGINAL = "43 9653-4523";

/** DDI 55 + somente os algarismos realmente informados. */
export const NUMERO_CORRETORA_EVOLUTION = `55${NUMERO_CORRETORA_ORIGINAL.replace(/\D/g, "")}`;

export const OBSERVACAO_CORRETORA =
  `Número original: ${NUMERO_CORRETORA_ORIGINAL}; normalizado: ${NUMERO_CORRETORA_EVOLUTION}`;
