import { readFile } from 'node:fs/promises';
import type { CustomerEmailJob, CustomerEmailMessage } from '../domain/customer-email.js';
import { renderQuotationDocument } from './quotation-document.js';

const logoUrl = new URL('../../assets/pas-quotation/peru-activa-logo-alterno.png', import.meta.url);
const logoId = 'peru-activa-brand';
const html = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
const money = (value: number) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);

function messageCopy(job: CustomerEmailJob) {
  const quote = job.snapshot.quotation;
  switch (job.kind) {
    case 'request_received':
      return {
        title: 'Recibimos tu solicitud',
        action: 'Ver mi solicitud',
        detail:
          'Perú Activa revisará las características y preparará tu cotización. Este correo confirma la recepción de la solicitud; la compra se confirma después de aceptar la cotización.',
      };
    case 'quotation_issued':
      if (!quote) throw new Error('quotation_required');
      return {
        title: 'Tu cotización está lista',
        action: 'Revisar cotización',
        detail: `Adjuntamos la cotización por ${money(quote.totalPricePEN)}. Es válida hasta ${quote.validUntil}. Puedes revisarla y aceptarla o rechazarla desde el portal.`,
      };
    case 'order_confirmed':
      return {
        title: 'Tu pedido está confirmado',
        action: 'Ver mi pedido',
        detail:
          'Registramos tu aceptación de la cotización. Tu pedido está confirmado y Perú Activa coordinará su preparación. Puedes consultar las características y la fecha acordada en el portal.',
      };
    case 'order_ready':
      return {
        title: 'Tu pedido está listo',
        action: 'Ver mi pedido',
        detail:
          'La producción de todas las prendas de tu pedido ha terminado. Responde a este correo para coordinar la entrega o el recojo.',
      };
  }
}

export function customerMessageBuilder(portalUrl: string, renderPdf = renderQuotationDocument) {
  return async (job: CustomerEmailJob): Promise<CustomerEmailMessage> => {
    const request = job.snapshot;
    const { title, action, detail } = messageCopy(job);
    const url = new URL(`/mis-pedidos/${encodeURIComponent(request.id)}`, portalUrl).href;
    const garments = [request.request.garment, ...request.request.additionalGarments];
    const summary = garments
      .map((garment) => `${garment.quantity} × ${garment.model}, ${garment.color}`)
      .join('\n');
    const text = `Hola, ${request.request.customer.contactName}.\n\n${title}.\nSolicitud ${request.id}\n\n${summary}\n\n${detail}\n\n${action}: ${url}\n\nPerú Activa`;
    const attachments: CustomerEmailMessage['attachments'] = [];
    if (job.kind === 'quotation_issued')
      attachments.push({
        filename: `Peru-Activa_Cotizacion_${request.id}.pdf`,
        content: await renderPdf(request),
        type: 'application/pdf',
        disposition: 'attachment',
      });
    attachments.push({
      filename: 'peru-activa-logo.png',
      content: await readFile(logoUrl),
      type: 'image/png',
      disposition: 'inline',
      contentId: logoId,
    });
    return {
      to: job.recipient,
      subject: `Perú Activa | ${title} | ${request.id}`,
      text,
      attachments,
      html: `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:0;background:#fbfaf6;color:#1f2328;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbfaf6"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #d8d2c5"><tr><td align="center" style="padding:24px;background:#ffffff;border-bottom:4px solid #18385f"><img src="cid:${logoId}" width="180" alt="Perú Activa" style="display:block;width:180px;max-width:100%;height:auto;border:0"></td></tr><tr><td style="padding:28px 28px 32px"><h1 style="margin:0 0 24px;color:#18385f;font-size:26px;line-height:1.25">${title}</h1><p>Hola, ${html(request.request.customer.contactName)}.</p><p>Solicitud <strong>${html(request.id)}</strong></p><ul style="padding-left:20px;line-height:1.6">${garments.map((garment) => `<li>${garment.quantity} × ${html(garment.model)}, ${html(garment.color)}</li>`).join('')}</ul><p style="line-height:1.6">${html(detail)}</p><p style="margin:28px 0"><a href="${html(url)}" style="display:inline-block;background:#18385f;color:#ffffff;padding:14px 22px;text-decoration:none;font-weight:bold;border-radius:4px">${action}</a></p><p style="margin:0;font-size:12px;line-height:1.5;color:#6b7280">Ingresa con el correo de tu cuenta para consultar el pedido. Puedes responder a este correo si necesitas ayuda.</p></td></tr></table></td></tr></table></body></html>`,
    };
  };
}
