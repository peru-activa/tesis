import type { QuotationRequestDraft } from '../../../../src/domain/quotation-requests';

export type Product = QuotationRequestDraft['garment']['product'];
export type PoloCut = Exclude<QuotationRequestDraft['garment']['cut'], 'no_aplica'>;
export type PoloSleeve = Exclude<QuotationRequestDraft['garment']['sleeve'], 'no_aplica'>;

export interface TextOption<T extends string> {
  value: T;
  label: string;
}

export interface PoloCollarOption {
  value: string;
  label: string;
  image: string;
  alt: string;
  previews: Record<
    PoloCut,
    Record<PoloSleeve, { image: string; alt: string; backImage: string; backAlt: string }>
  >;
}

export interface FabricOption {
  name: string;
  title: string;
  description: string;
  benefit: string;
  specification: string;
  image?: string;
  alt: string;
  previewKind?: 'swatch' | 'garment';
}

export const poloCollars: readonly PoloCollarOption[] = [
  {
    value: 'Cuello redondo',
    label: 'Redondo',
    image: '/catalog/polo-cuello-redondo-referencial.webp',
    alt: 'Polo azul marino referencial con cuello redondo',
    previews: {
      estandar: {
        manga_corta: {
          image: '/catalog/polo-cuello-redondo-referencial.webp',
          alt: 'Polo azul marino referencial con cuello redondo',
          backImage: '/catalog/polo-cuello-redondo-referencial-espalda.webp',
          backAlt: 'Espalda de polo azul marino referencial con cuello redondo',
        },
        manga_larga: {
          image: '/catalog/polo-cuello-redondo-manga-larga-referencial.webp',
          alt: 'Polo azul marino referencial de manga larga con cuello redondo',
          backImage: '/catalog/polo-cuello-redondo-manga-larga-referencial-espalda.webp',
          backAlt: 'Espalda de polo azul marino referencial de manga larga con cuello redondo',
        },
      },
      princesa_dama: {
        manga_corta: {
          image: '/catalog/polo-cuello-redondo-princesa-dama-referencial.webp',
          alt: 'Polo azul marino referencial de corte princesa para dama con cuello redondo',
          backImage: '/catalog/polo-cuello-redondo-princesa-dama-referencial-espalda.webp',
          backAlt:
            'Espalda de polo azul marino referencial de corte princesa para dama con cuello redondo',
        },
        manga_larga: {
          image: '/catalog/polo-cuello-redondo-princesa-dama-manga-larga-referencial.webp',
          alt: 'Polo azul marino referencial de corte princesa para dama de manga larga con cuello redondo',
          backImage:
            '/catalog/polo-cuello-redondo-princesa-dama-manga-larga-referencial-espalda.webp',
          backAlt:
            'Espalda de polo azul marino referencial de corte princesa para dama de manga larga con cuello redondo',
        },
      },
    },
  },
  {
    value: 'Cuello V',
    label: 'Cuello V',
    image: '/catalog/polo-cuello-v-referencial.webp',
    alt: 'Polo azul marino referencial con cuello V',
    previews: {
      estandar: {
        manga_corta: {
          image: '/catalog/polo-cuello-v-referencial.webp',
          alt: 'Polo azul marino referencial con cuello V',
          backImage: '/catalog/polo-cuello-redondo-referencial-espalda.webp',
          backAlt: 'Espalda de polo azul marino referencial con cuello v',
        },
        manga_larga: {
          image: '/catalog/polo-cuello-v-manga-larga-referencial.webp',
          alt: 'Polo azul marino referencial de manga larga con cuello V',
          backImage: '/catalog/polo-cuello-redondo-manga-larga-referencial-espalda.webp',
          backAlt: 'Espalda de polo azul marino referencial de manga larga con cuello v',
        },
      },
      princesa_dama: {
        manga_corta: {
          image: '/catalog/polo-cuello-v-princesa-dama-referencial.webp',
          alt: 'Polo azul marino referencial de corte princesa para dama con cuello V',
          backImage: '/catalog/polo-cuello-redondo-princesa-dama-referencial-espalda.webp',
          backAlt:
            'Espalda de polo azul marino referencial de corte princesa para dama con cuello v',
        },
        manga_larga: {
          image: '/catalog/polo-cuello-v-princesa-dama-manga-larga-referencial.webp',
          alt: 'Polo azul marino referencial de corte princesa para dama de manga larga con cuello V',
          backImage:
            '/catalog/polo-cuello-redondo-princesa-dama-manga-larga-referencial-espalda.webp',
          backAlt:
            'Espalda de polo azul marino referencial de corte princesa para dama de manga larga con cuello v',
        },
      },
    },
  },
  {
    value: 'Cuello camisero',
    label: 'Camisero',
    image: '/catalog/polo-cuello-camisero-referencial.webp',
    alt: 'Polo azul marino referencial con cuello camisero',
    previews: {
      estandar: {
        manga_corta: {
          image: '/catalog/polo-cuello-camisero-referencial.webp',
          alt: 'Polo azul marino referencial con cuello camisero',
          backImage: '/catalog/polo-cuello-camisero-referencial-espalda.webp',
          backAlt: 'Espalda de polo azul marino referencial con cuello camisero',
        },
        manga_larga: {
          image: '/catalog/polo-cuello-camisero-manga-larga-referencial.webp',
          alt: 'Polo azul marino referencial de manga larga con cuello camisero',
          backImage: '/catalog/polo-cuello-camisero-manga-larga-referencial-espalda.webp',
          backAlt: 'Espalda de polo azul marino referencial de manga larga con cuello camisero',
        },
      },
      princesa_dama: {
        manga_corta: {
          image: '/catalog/polo-cuello-camisero-princesa-dama-referencial.webp',
          alt: 'Polo azul marino referencial de corte princesa para dama con cuello camisero',
          backImage: '/catalog/polo-cuello-camisero-princesa-dama-referencial-espalda.webp',
          backAlt:
            'Espalda de polo azul marino referencial de corte princesa para dama con cuello camisero',
        },
        manga_larga: {
          image: '/catalog/polo-cuello-camisero-princesa-dama-manga-larga-referencial.webp',
          alt: 'Polo azul marino referencial de corte princesa para dama de manga larga con cuello camisero',
          backImage:
            '/catalog/polo-cuello-camisero-princesa-dama-manga-larga-referencial-espalda.webp',
          backAlt:
            'Espalda de polo azul marino referencial de corte princesa para dama de manga larga con cuello camisero',
        },
      },
    },
  },
];

export const poloCuts: readonly TextOption<PoloCut>[] = [
  { value: 'estandar', label: 'Estándar' },
  { value: 'princesa_dama', label: 'Princesa dama' },
];

export const poloSleeves: readonly TextOption<PoloSleeve>[] = [
  { value: 'manga_corta', label: 'Manga corta' },
  { value: 'manga_larga', label: 'Manga larga' },
];

export const fabricsByProduct: Record<Product, readonly FabricOption[]> = {
  polo: [
    {
      name: 'Umbrela',
      title: 'Umbrela',
      description: 'Tela solicitada',
      benefit: 'Calidad y acabado por confirmar en la cotización',
      specification: 'Imagen referencial · composición por confirmar',
      image: '/catalog/tela-umbrela-referencial.webp',
      alt: 'Muestra referencial de tela Umbrela azul marino, basada en la referencia del usuario',
    },
    {
      name: 'Zanetti 100 % poliéster',
      title: 'Zanetti',
      description: '100 % poliéster',
      benefit: 'Fácil cuidado para uso institucional',
      specification: 'Composición: 100 % poliéster',
      image: '/catalog/tela-zanetti-referencial.webp',
      alt: 'Muestra referencial de tela Zanetti azul marino',
    },
    {
      name: 'Piqué Lacoste',
      title: 'Piqué Lacoste',
      description: 'Tejido con textura',
      benefit: 'Presentación estructurada con textura visible',
      specification: 'Construcción: tejido piqué',
      image: '/catalog/tela-pique-lacoste-referencial.webp',
      alt: 'Muestra referencial de tejido piqué Lacoste azul marino',
    },
    {
      name: 'Algodón pima 20/1',
      title: 'Pima 20/1',
      description: 'Algodón',
      benefit: 'Mayor cuerpo para una prenda consistente',
      specification: 'Fibra: algodón · título 20/1',
      image: '/catalog/tela-pima-20-1-referencial.webp',
      alt: 'Muestra referencial de algodón pima 20/1 azul marino',
    },
    {
      name: 'Algodón pima 30/1',
      title: 'Pima 30/1',
      description: 'Algodón',
      benefit: 'Acabado más ligero y fino',
      specification: 'Fibra: algodón · título 30/1',
      image: '/catalog/tela-pima-30-1-referencial.webp',
      alt: 'Muestra referencial de algodón pima 30/1 azul marino',
    },
    {
      name: 'Win',
      title: 'Win',
      description: 'Tela deportiva',
      benefit: 'Alternativa para prendas de uso deportivo',
      specification: 'Categoría: tejido deportivo',
      image: '/catalog/tela-win-referencial.webp',
      alt: 'Muestra referencial de tela deportiva Win azul marino',
    },
    {
      name: 'Dry fit',
      title: 'Dry fit',
      description: 'Tela deportiva',
      benefit: 'Favorece el manejo de humedad durante el uso',
      specification: 'Categoría: tejido técnico deportivo',
      image: '/catalog/tela-dry-fit-referencial-v2.webp',
      alt: 'Muestra referencial de tela dry fit azul marino con perforaciones pequeñas y alargadas',
    },
  ],
  buzo: [
    {
      name: 'Microtec poliéster',
      title: 'Microtec',
      description: 'Poliéster',
      benefit: 'Alternativa ligera para conjuntos deportivos',
      specification: 'Composición principal: poliéster',
      image: '/catalog/buzo-microtec-referencial.png',
      alt: 'Conjunto de buzo gris referencial en tela Microtec',
      previewKind: 'garment',
    },
    {
      name: 'Interfil perchado',
      title: 'Interfil',
      description: 'Poliéster perchado',
      benefit: 'Abrigo y resistencia para conjuntos deportivos',
      specification: 'Cara de poliéster e interior perchado',
      image: '/catalog/buzo-interfil-referencial.webp',
      alt: 'Conjunto de buzo azul marino referencial en tela Interfil',
      previewKind: 'garment',
    },
    {
      name: 'Golfín',
      title: 'Golfín',
      description: 'Tela deportiva',
      benefit: 'Acabado ligero para uso deportivo',
      specification: 'Especificación técnica por confirmar con Perú Activa',
      image: '/catalog/buzo-golfin-referencial.webp',
      alt: 'Conjunto de buzo azul marino referencial en tela Golfín',
      previewKind: 'garment',
    },
  ],
};

export function findFabricOption(product: Product, name?: string): FabricOption | undefined {
  return name ? fabricsByProduct[product].find((option) => option.name === name) : undefined;
}

/** Shared by configuration, design placement and the persisted request summary. */
export function findPoloPreview({
  model,
  cut,
  sleeve,
}: {
  model?: string;
  cut?: QuotationRequestDraft['garment']['cut'];
  sleeve?: QuotationRequestDraft['garment']['sleeve'];
}) {
  const collar = poloCollars.find((option) => option.value === model);
  const previewCut = !cut || cut === 'no_aplica' ? 'estandar' : cut;
  const previewSleeve = !sleeve || sleeve === 'no_aplica' ? 'manga_corta' : sleeve;
  return collar?.previews[previewCut][previewSleeve];
}
