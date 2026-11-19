import type { CustomerProfile } from '../domain/customer-registration.js';
import type { ResearchConsentDocument } from '../domain/research-consent.js';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character]!;
  });
}

function receipt(profile: CustomerProfile): string {
  const consent = profile.thesisConsent;
  if (!consent) return '';
  const person = consent.acceptedBy;
  return `<section class="receipt"><h2>Constancia de aceptación electrónica</h2>
    <dl><dt>Participante</dt><dd>${escapeHtml(person?.fullName ?? profile.fullName)}</dd>
    ${person ? `<dt>Cuenta verificada</dt><dd>${escapeHtml(person.email)}</dd>` : ''}
    <dt>Fecha y hora (UTC)</dt><dd>${escapeHtml(consent.acceptedAt)}</dd>
    <dt>Versión aceptada</dt><dd>${escapeHtml(consent.notice.version)}</dd></dl>
    <p>${escapeHtml(consent.notice.acceptance)}</p>
    ${consent.documentSha256 ? `<p class="digest">Huella SHA-256 del documento<br>${escapeHtml(consent.documentSha256)}</p>` : ''}
  </section>`;
}

export function renderConsentDocument(
  document: ResearchConsentDocument,
  downloadUrl: string,
  profile?: CustomerProfile,
): string {
  const pages = document.pages
    .map(
      (page, index) => `
    <article class="page">
      <header><p>Consentimiento informado · versión ${escapeHtml(document.version)} · ${escapeHtml(document.issuedOn)}</p>
      <h1>${escapeHtml(document.studyTitle)}</h1></header>
      ${
        index === 0
          ? `<section class="responsibles"><p><strong>Investigador responsable</strong><br>${escapeHtml(document.investigator)}<br>${escapeHtml(document.affiliation)}</p>
        <p><strong>Asesor</strong><br>${escapeHtml(document.advisor)}</p></section>`
          : ''
      }
      ${page.sections.map((section) => `<section><h2>${escapeHtml(section.title)}</h2>${section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}</section>`).join('')}
      ${index === document.pages.length - 1 && profile ? receipt(profile) : ''}
      <footer>Página ${index + 1} de ${document.pages.length} · Versión ${escapeHtml(document.version)} · ${escapeHtml(document.issuedOn)}</footer>
    </article>`,
    )
    .join('');
  return layout(document.studyTitle, downloadUrl, pages);
}

export function renderLegacyConsent(profile: CustomerProfile, downloadUrl: string): string {
  const consent = profile.thesisConsent!;
  const notice = consent.notice;
  return layout(
    'Constancia de consentimiento',
    downloadUrl,
    `
    <article class="page"><h1>Constancia de consentimiento</h1>
    ${receipt(profile)}
    <h2>Texto presentado al aceptar</h2>
    ${[notice.purpose, notice.publication, notice.choice].map((text) => `<p>${escapeHtml(text)}</p>`).join('')}
    <footer>Página 1 de 1 · Versión ${escapeHtml(notice.version)}</footer></article>`,
  );
}

function layout(title: string, downloadUrl: string, pages: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(title)} · Consentimiento informado</title>
    <style>
      *{box-sizing:border-box}body{margin:0;background:#eef1f5;color:#18253c;font:16px/1.5 Arial,sans-serif}
      .tools{max-width:820px;margin:24px auto;padding:0 20px}.tools a{color:#153e75;font-weight:bold}
      .page{background:white;max-width:820px;margin:20px auto;padding:36px;box-shadow:0 2px 12px #0001}
      header>p,footer{font-size:12px;color:#475569}h1{font-size:23px;line-height:1.2}h2{font-size:17px;margin:18px 0 5px}
      p{margin:7px 0}section{break-inside:avoid}footer{border-top:1px solid #cbd5e1;margin-top:22px;padding-top:10px}
      dl{display:grid;grid-template-columns:145px 1fr;gap:4px 12px}dt{font-weight:bold}dd{margin:0;overflow-wrap:anywhere}
      .receipt{border-top:1px solid #cbd5e1;margin-top:16px}.digest{font-size:10px;overflow-wrap:anywhere}
      @media(max-width:600px){.page{margin:12px;padding:22px}dl{display:block}dd{margin:0 0 9px}h1{font-size:21px}}
      @page{size:A4;margin:12mm}
      @media print{body{background:white;color:black;font-size:10pt;line-height:1.3}.tools{display:none}
        .page{box-shadow:none;margin:0;padding:0;max-width:none;break-after:page}
        .page:last-child{break-after:auto}h1{font-size:17pt}h2{font-size:11pt;margin-top:10px}
        p{margin:5px 0}header>p,footer{font-size:8pt}footer{margin-top:12px}.digest{font-size:7pt}}
    </style></head><body><nav class="tools" aria-label="Copia del consentimiento">
      <a href="${escapeHtml(downloadUrl)}">Descargar una copia</a>
      <p>Puedes imprimir o guardar como PDF desde la opción Imprimir de tu navegador.</p>
    </nav><main>${pages}</main></body></html>`;
}
