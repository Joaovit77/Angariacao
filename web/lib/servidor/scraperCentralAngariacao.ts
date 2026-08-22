/* ================================================================
   COLETOR SOB DEMANDA — PLAYWRIGHT

   Um navegador nasce somente depois do clique em Buscar e é sempre
   encerrado no `finally`. Não há cron, monitor ou processo permanente.
   Seletores ficam nesta camada para mudança de portal não contaminar a
   rota, a UI nem o contrato de AnuncioCentralAngariacao.
   ================================================================ */
import { existsSync } from "node:fs";
import type { Browser, Page } from "playwright-core";
import { dataPublicacaoOlx, dentroDoPeriodo } from "@/lib/datas";
import {
  idDoAnuncio,
  type AnuncioCentralAngariacao,
  type FiltrosCentralAngariacao,
} from "@/lib/calculo/centralAngariacao";

const LIMITE_RESULTADOS = 50;
const TIMEOUT_NAVEGACAO_MS = 25_000;
const TIMEOUT_CARDS_MS = 15_000;

interface ConfiguracaoNavegador {
  executablePath: string;
  args: string[];
}

async function configuracaoNavegador(): Promise<ConfiguracaoNavegador | null> {
  const candidatos = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    process.env.PROGRAMFILES ? `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe` : null,
    process.env["PROGRAMFILES(X86)"] ? `${process.env["PROGRAMFILES(X86)"]}\\Google\\Chrome\\Application\\chrome.exe` : null,
    process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : null,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter((p): p is string => !!p);
  const local = candidatos.find((p) => existsSync(p));
  if (local) return { executablePath: local, args: [] };

  // A imagem Linux da Vercel não traz Chrome. O pacote contém o headless
  // shell e as bibliotecas necessárias, extraídos para /tmp no cold start.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromiumServerless = (await import("@sparticuz/chromium")).default;
    chromiumServerless.setGraphicsMode = false;
    return {
      executablePath: await chromiumServerless.executablePath(),
      args: chromiumServerless.args,
    };
  }
  return null;
}

function dinheiro(texto: string | null | undefined): number | null {
  if (!texto) return null;
  const encontrado = texto.match(/R\$\s*([\d.]+)/);
  if (!encontrado) return null;
  const valor = Number(encontrado[1].replace(/\./g, ""));
  return Number.isFinite(valor) ? valor : null;
}

function cidadeBairro(texto: string | null | undefined): { cidade: string | null; bairro: string | null } {
  const partes = (texto || "").replace(/^\s+|\s+$/g, "").split(",").map((p) => p.trim()).filter(Boolean);
  if (partes.length < 2) return { cidade: partes[0] || null, bairro: null };
  return { cidade: partes[0], bairro: partes.slice(1).join(", ") };
}

function cidadeBairroWimoveis(texto: string | null | undefined): { cidade: string | null; bairro: string | null } {
  const partes = (texto || "").split(",").map((p) => p.trim()).filter(Boolean);
  if (partes.length < 2) return { cidade: partes[0] || null, bairro: null };
  const ultimo = partes.at(-1)?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  // Alguns cards substituem o bairro pelo estado: "Londrina, Paraná".
  if (ultimo === "parana" || ultimo === "pr") return { cidade: partes[0], bairro: null };
  return { cidade: partes.at(-1) || null, bairro: partes.slice(0, -1).join(", ") || null };
}

async function prepararPagina(page: Page) {
  page.setDefaultTimeout(8_000);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  await page.route(/google-analytics|googletagmanager|doubleclick|taboola|facebook\.com/, (route) => route.abort());
}

async function esperarCards(page: Page, seletor: string, portal: string) {
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    try {
      await page.locator(seletor).first().waitFor({ state: "visible", timeout: TIMEOUT_CARDS_MS });
      return;
    } catch (erro) {
      console.warn("[central-angariacao] cards ainda ausentes", {
        portal,
        tentativa,
        url: page.url(),
        titulo: await page.title().catch(() => ""),
        erro: erro instanceof Error ? erro.message : String(erro),
      });
      if (tentativa === 2) throw erro;
      await page.reload({ waitUntil: "domcontentloaded", timeout: TIMEOUT_NAVEGACAO_MS });
      await page.waitForTimeout(1_500);
    }
  }
}

async function coletarOlx(page: Page, filtros: FiltrosCentralAngariacao): Promise<AnuncioCentralAngariacao[]> {
  const aceitarCookies = page.getByRole("button", { name: "Aceitar", exact: true });
  if (await aceitarCookies.isVisible().catch(() => false)) {
    await aceitarCookies.click().catch(() => undefined);
  }

  let filtroParticularConfirmado = false;
  if (filtros.somenteProprietario) {
    const particular = page.getByRole("checkbox", { name: "Particular", exact: true });
    if (await particular.isVisible().catch(() => false)) {
      filtroParticularConfirmado = await particular.isChecked().catch(() => false);
      if (!filtroParticularConfirmado) {
        // O input é estilizado e a OLX reage ao label, não ao `check()` direto.
        await page.locator('label[for="chips-id-company_ad-Particular"]').click().catch(() => undefined);
        await page.waitForTimeout(1_000);
        filtroParticularConfirmado = await particular.isChecked().catch(() => false);
      }
    }
  }

  await esperarCards(page, 'a[data-testid="adcard-link"]', "olx");
  const brutos = await page.locator("section.olx-adcard").evaluateAll((cards, limite) =>
    cards.slice(0, limite).map((card) => {
      const link = card.querySelector<HTMLAnchorElement>('a[data-testid="adcard-link"]');
      const imagem = card.querySelector<HTMLImageElement>("img");
      return {
        url: link?.href || "",
        titulo: link?.getAttribute("title") || link?.textContent?.trim() || "",
        preco: card.querySelector(".olx-adcard__price")?.textContent?.trim() || "",
        local: card.querySelector(".olx-adcard__location")?.textContent?.trim() || "",
        imagem: imagem?.currentSrc || imagem?.src || imagem?.getAttribute("data-src") || imagem?.getAttribute("data-lazy-src") || "",
        descricao: card.querySelector(".olx-adcard__details")?.textContent?.trim() || "",
        publicadoTexto: card.querySelector(".olx-adcard__date")?.textContent?.trim() || "",
      };
    }), LIMITE_RESULTADOS);

  return brutos.flatMap((item, indice) => {
    if (!item.url || !item.titulo || !/\d{6,}(?:\?|$)/.test(item.url)) return [];
    const local = cidadeBairro(item.local);
    const publicado = dataPublicacaoOlx(item.publicadoTexto);
    const publicadoEm = publicado?.toISOString() || null;
    if (filtros.diasPublicacao && !dentroDoPeriodo(publicadoEm, filtros.diasPublicacao)) return [];
    return [{
      idExterno: idDoAnuncio("olx", item.url, indice),
      portal: "olx" as const,
      titulo: item.titulo,
      preco: dinheiro(item.preco),
      cidade: local.cidade,
      bairro: local.bairro,
      endereco: null,
      imagem: item.imagem || null,
      url: item.url,
      descricao: item.descricao || null,
      publicadoEm,
      publicadoTexto: item.publicadoTexto || null,
      anunciante: filtroParticularConfirmado ? "proprietario" as const : "incerto" as const,
    }];
  });
}

async function coletarChaves(page: Page): Promise<AnuncioCentralAngariacao[]> {
  const seletor = 'a[href*="/imovel/"][href*="/id-"]';
  await esperarCards(page, seletor, "chaves-na-mao");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(600);
  const brutos = await page.locator(seletor).evaluateAll((links, limite) =>
    links.slice(0, limite).map((elemento) => {
      const link = elemento as HTMLAnchorElement;
      const paragrafos = [...link.querySelectorAll("p")].map((p) => p.textContent?.trim() || "").filter(Boolean);
      const imagem = link.querySelector<HTMLImageElement>("img");
      return {
        url: link.href,
        titulo: link.querySelector("h2")?.textContent?.trim() || link.getAttribute("title") || "",
        textos: paragrafos,
        imagem: imagem?.currentSrc || imagem?.src || imagem?.getAttribute("data-src") || imagem?.getAttribute("data-lazy-src") || "",
      };
    }), LIMITE_RESULTADOS);

  const vistos = new Set<string>();
  return brutos.flatMap((item, indice) => {
    if (!item.url || !item.titulo || vistos.has(item.url)) return [];
    vistos.add(item.url);
    const precoTexto = [...item.textos].reverse().find((t) => /R\$\s*[\d.]+/.test(t));
    const localidade = item.textos.find((t) => /,\s*[^/]+\/PR/i.test(t));
    const endereco = item.textos.find((t) => t !== localidade && !/R\$|m²|^\d+$|Endereço indisponível/i.test(t));
    const local = cidadeBairro(localidade?.replace(/\/PR.*$/, "").split(",").reverse().join(", "));
    return [{
      idExterno: idDoAnuncio("chaves-na-mao", item.url, indice),
      portal: "chaves-na-mao" as const,
      titulo: item.titulo,
      preco: dinheiro(precoTexto),
      cidade: local.cidade,
      bairro: local.bairro,
      endereco: endereco || null,
      imagem: item.imagem || null,
      url: item.url,
      descricao: item.textos.join(" · ") || null,
      anunciante: "incerto" as const,
    }];
  });
}

async function coletarWimoveis(page: Page, filtros: FiltrosCentralAngariacao): Promise<AnuncioCentralAngariacao[]> {
  const aceitarCookies = page.getByRole("button", { name: "Aceito", exact: true });
  if (await aceitarCookies.isVisible().catch(() => false)) await aceitarCookies.click().catch(() => undefined);
  const seletor = '[data-qa="posting PROPERTY"], [data-to-posting*="/propriedades/"]';
  await esperarCards(page, seletor, "wimoveis");
  const brutos = await page.locator(seletor).evaluateAll((cards, limite) =>
    cards.slice(0, limite).map((card) => ({
      id: card.getAttribute("data-id") || "",
      url: card.getAttribute("data-to-posting") || "",
      titulo: card.querySelector<HTMLImageElement>('img[alt]:not([alt=""])')?.alt || "",
      preco: card.querySelector('[data-qa="POSTING_CARD_PRICE"]')?.textContent?.trim() || "",
      caracteristicas: card.querySelector('[data-qa="POSTING_CARD_FEATURES"]')?.textContent?.trim() || "",
      endereco: card.querySelector('[class*="location-address"]')?.textContent?.trim() || "",
      local: card.querySelector('[data-qa="POSTING_CARD_LOCATION"]')?.textContent?.trim() || "",
      imagem: card.querySelector<HTMLImageElement>('[data-qa="POSTING_CARD_GALLERY"] img')?.currentSrc
        || card.querySelector<HTMLImageElement>('[data-qa="POSTING_CARD_GALLERY"] img')?.src
        || "",
    })), LIMITE_RESULTADOS);

  return brutos.flatMap((item, indice) => {
    if (!item.url || !item.titulo) return [];
    const preco = dinheiro(item.preco);
    const quartos = Number(item.caracteristicas.match(/(\d+)\s+quartos?/i)?.[1]);
    if (filtros.valorMin != null && (preco == null || preco < filtros.valorMin)) return [];
    if (filtros.valorMax != null && (preco == null || preco > filtros.valorMax)) return [];
    if (filtros.dormitorios != null && (!Number.isFinite(quartos) || quartos < filtros.dormitorios)) return [];
    const local = cidadeBairroWimoveis(item.local);
    const url = new URL(item.url, "https://www.wimoveis.com.br").toString();
    return [{
      idExterno: item.id || idDoAnuncio("wimoveis", url, indice),
      portal: "wimoveis" as const,
      titulo: item.titulo,
      preco,
      cidade: local.cidade,
      bairro: local.bairro,
      endereco: item.endereco || null,
      imagem: item.imagem || null,
      url,
      descricao: item.caracteristicas || null,
      anunciante: filtros.somenteProprietario ? "proprietario" as const : "incerto" as const,
    }];
  });
}

async function coletarVivaReal(page: Page, filtros: FiltrosCentralAngariacao): Promise<AnuncioCentralAngariacao[]> {
  const seletor = 'a[href*="vivareal.com.br/imovel/"][href*="-id-"]';
  await esperarCards(page, seletor, "viva-real");
  const brutos = await page.locator(seletor).evaluateAll((links, limite) =>
    links.slice(0, limite).map((elemento) => {
      const link = elemento as HTMLAnchorElement;
      const paragrafos = [...link.querySelectorAll("p")].map((p) => p.textContent?.trim() || "").filter(Boolean);
      return {
        url: link.href,
        titulo: link.querySelector("h2")?.textContent?.replace(/\s+/g, " ").trim() || "",
        paragrafos,
        imagem: link.querySelector<HTMLImageElement>("img")?.currentSrc || link.querySelector<HTMLImageElement>("img")?.src || "",
      };
    }), LIMITE_RESULTADOS);

  const vistos = new Set<string>();
  return brutos.flatMap((item, indice) => {
    if (!item.url || !item.titulo || vistos.has(item.url)) return [];
    vistos.add(item.url);
    const precoTexto = item.paragrafos.find((texto) => /R\$\s*[\d.]+/.test(texto));
    const preco = dinheiro(precoTexto);
    if (filtros.valorMin != null && (preco == null || preco < filtros.valorMin)) return [];
    if (filtros.valorMax != null && (preco == null || preco > filtros.valorMax)) return [];
    const quartos = Number(item.titulo.match(/(\d+)\s+quartos?/i)?.[1]);
    if (filtros.dormitorios != null && (!Number.isFinite(quartos) || quartos < filtros.dormitorios)) return [];
    const localTexto = item.titulo.match(/\bem\s+(.+),\s*([^,]+)$/i);
    const endereco = item.paragrafos.find((texto) => /^(Rua|Avenida|Alameda|Travessa|Rodovia|Estrada)\b/i.test(texto));
    return [{
      idExterno: idDoAnuncio("viva-real", item.url, indice),
      portal: "viva-real" as const,
      titulo: item.titulo,
      preco,
      cidade: localTexto?.[2]?.trim() || filtros.cidade,
      bairro: localTexto?.[1]?.trim() || null,
      endereco: endereco || null,
      imagem: item.imagem || null,
      url: item.url,
      descricao: null,
      anunciante: "incerto" as const,
    }];
  });
}

export class NavegadorIndisponivel extends Error {}

export async function buscarComNavegador(
  filtros: FiltrosCentralAngariacao,
  urlPesquisa: string,
): Promise<AnuncioCentralAngariacao[]> {
  const configuracao = await configuracaoNavegador();
  if (!configuracao) throw new NavegadorIndisponivel("Chrome não encontrado no servidor.");

  const { chromium } = await import("playwright-core");
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({
      executablePath: configuracao.executablePath,
      headless: true,
      ignoreDefaultArgs: ["--enable-automation"],
      args: [
        ...configuracao.args,
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-blink-features=AutomationControlled",
        "--disable-features=AutomationControlled",
      ],
    });
    const contexto = await browser.newContext({
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
      viewport: { width: 1440, height: 1000 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
      extraHTTPHeaders: { "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7" },
    });
    const page = await contexto.newPage();
    await prepararPagina(page);
    const navegacao = await page.goto(urlPesquisa, { waitUntil: "domcontentloaded", timeout: TIMEOUT_NAVEGACAO_MS });
    if (navegacao && navegacao.status() >= 400) {
      console.warn("[central-angariacao] portal respondeu na navegação", {
        portal: filtros.portal,
        status: navegacao.status(),
        url: page.url(),
      });
    }
    // O `await` é obrigatório: sem ele o `finally` fecha o browser enquanto
    // o parser ainda espera os cards, produzindo "Target page has been closed".
    switch (filtros.portal) {
      case "olx": return await coletarOlx(page, filtros);
      case "chaves-na-mao": return await coletarChaves(page);
      case "wimoveis": return await coletarWimoveis(page, filtros);
      case "viva-real": return await coletarVivaReal(page, filtros);
    }
    throw new Error("Portal não suportado pelo coletor.");
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
