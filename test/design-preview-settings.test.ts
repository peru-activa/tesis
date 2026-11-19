import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { MemoryOrderStore } from '../src/data/order-store.js';
import { MemoryQuotationStore } from '../src/infrastructure/quotation-store.js';
import { quotationRequestDraftSchema } from '../src/domain/quotation-requests.js';

test('el pedido conserva opciones de transparencia y el archivo original al guardarlo y reabrirlo', async () => {
  const attachment = {
    name: 'logo-simulado.png',
    mediaType: 'image/png',
    sizeBytes: 4,
    dataUrl: 'data:image/png;base64,AAAA',
    text: { value: 'Equipo Águilas', fontFamily: 'Montserrat', weight: 700, color: '#ffffff' },
    preview: {
      backgroundMode: 'remove',
      backgroundColor: '#ffffff',
      tolerance: 22,
      inkColor: '#ffffff',
      removeEnclosed: true,
    },
  };
  const draft = {
    customer: {
      contactName: 'Cliente simulado',
      businessName: 'Prueba técnica',
      contact: 'logo@example.test',
    },
    garment: {
      product: 'polo',
      model: 'Cuello redondo',
      audience: 'unisex',
      sleeve: 'manga_corta',
      cut: 'estandar',
      quantity: 20,
      sizes: [{ size: 'M', quantity: 20 }],
      color: 'Rojo',
      fabric: { mode: 'proposal' },
      customization: 'embroidery',
      applicationCount: 1,
      customizationDetails: 'Frente',
      designReference: '',
      designAttachment: attachment,
      designApplications: [
        { attachment, method: 'embroidery', placement: 'Frente', widthCm: 8, heightCm: 5 },
      ],
    },
    additionalGarments: [],
    delivery: { requiredBy: '2099-12-15', location: 'Lima de prueba' },
    notes: 'Datos simulados',
  };
  const server = createServer(
    createApp({ orderStore: new MemoryOrderStore(), quotationStore: new MemoryQuotationStore() }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const created = await fetch(`${origin}/v1/quotation-requests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(draft),
    });
    assert.equal(created.status, 201);
    const payload = await created.json();
    const response = await fetch(`${origin}/v1/quotation-requests/${payload.request.id}`);
    assert.equal(response.status, 200);
    const stored = await response.json();
    assert.deepEqual(stored.request.request.garment.designAttachment, attachment);
    assert.deepEqual(stored.request.request.garment.designApplications[0].attachment, attachment);
    const invalidText = structuredClone(draft);
    for (const text of [
      { value: '', fontFamily: 'Montserrat', weight: 700, color: '#ffffff' },
      { value: 'A', fontFamily: 'font-from-outside', weight: 700, color: '#ffffff' },
      { value: 'A', fontFamily: 'Montserrat', weight: 700, color: 'white' },
      { value: '1\n2\n3\n4\n5', fontFamily: 'Montserrat', weight: 700, color: '#ffffff' },
    ]) {
      Object.assign(invalidText.garment.designApplications[0]!.attachment, { text });
      assert.equal(quotationRequestDraftSchema.safeParse(invalidText).success, false);
    }
    const legacy = structuredClone(draft);
    Reflect.deleteProperty(legacy.garment.designAttachment, 'preview');
    Reflect.deleteProperty(legacy.garment.designApplications[0]!.attachment, 'preview');
    assert.equal(quotationRequestDraftSchema.safeParse(legacy).success, true);
    for (const preview of [
      { backgroundMode: 'unknown' },
      { backgroundMode: 'remove', backgroundColor: 'bad' },
      { backgroundMode: 'auto', tolerance: 900 },
      { backgroundMode: 'auto', inkColor: 'white' },
      { backgroundMode: 'auto', inkColor: '#ffff' },
    ]) {
      const invalid = structuredClone(draft);
      Object.assign(invalid.garment.designApplications[0]!.attachment, { preview });
      assert.equal(quotationRequestDraftSchema.safeParse(invalid).success, false);
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
