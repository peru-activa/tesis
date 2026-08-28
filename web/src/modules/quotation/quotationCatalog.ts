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
  longSleeveImage: string;
  longSleeveAlt: string;
}

export interface FabricOption {
  name: string;
  title: string;
  description: string;
  benefit: string;
  specification: string;
  image: string;
  alt: string;
  previewKind?: 'swatch' | 'garment';
}

export const poloCollars: readonly PoloCollarOption[] = [
  {
    value: 'Cuello redondo',
    label: 'Redondo',
    image: '/catalog/polo-cuello-redondo-referencial.webp',
    alt: 'Polo azul marino referencial con cuello redondo',
    longSleeveImage: '/catalog/polo-cuello-redondo-manga-larga-referencial.webp',
    longSleeveAlt: 'Polo azul marino referencial de manga larga con cuello redondo',
  },
  {
    value: 'Cuello V',
    label: 'Cuello V',
    image: '/catalog/polo-cuello-v-referencial.webp',
    alt: 'Polo azul marino referencial con cuello V',
    longSleeveImage: '/catalog/polo-cuello-v-manga-larga-referencial.webp',
    longSleeveAlt: 'Polo azul marino referencial de manga larga con cuello V',
  },
  {
    value: 'Cuello camisero',
    label: 'Camisero',
    image: '/catalog/polo-cuello-camisero-referencial.webp',
    alt: 'Polo azul marino referencial con cuello camisero',
    longSleeveImage: '/catalog/polo-cuello-camisero-manga-larga-referencial.webp',
    longSleeveAlt: 'Polo azul marino referencial de manga larga con cuello camisero',
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
      image: '/catalog/tela-dry-fit-referencial.webp',
      alt: 'Muestra referencial de tela dry fit azul marino',
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
