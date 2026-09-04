/** Somente valores sintéticos; nenhuma credencial real. */
export function erroExternoSintetico() {
  const headers = {
    Authorization: "Bearer super-secret",
    "Proxy-Authorization": "proxy-secret",
    "X-API-Key": "secret-key",
    "api-key": "api-secret",
    Cookie: "session=secret",
    "Set-Cookie": "token=secret",
  };
  return Object.assign(new Error("resposta-crua <html>email-privado senha-secreta</html>"), {
    status: 403,
    code: "codigo-externo-secreto",
    headers,
    request: { headers, body: "dados-privados" },
    response: { headers, body: "html-integral" },
    config: { password: "senha-secreta", service_role: "service-secret" },
    cause: { token: "cause-secret" },
  });
}
