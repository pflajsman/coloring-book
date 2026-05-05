export type ColorRGBA = [number, number, number, number];

export type Point = { x: number; y: number; pressure: number; t: number };

export type StrokeStyle = {
  color: string;
  size: number;
  pressureSensitivity: number;
  eraser: boolean;
};

export type StrokeOp = {
  kind: 'stroke';
  id: string;
  layerId: string;
  style: StrokeStyle;
  points: Point[];
};

export type FillOp = {
  kind: 'fill';
  id: string;
  layerId: string;
  x: number;
  y: number;
  color: string;
  tolerance: number;
};

export type LayerOp =
  | { kind: 'addLayer'; id: string; layerId: string; name: string; index: number }
  | { kind: 'removeLayer'; id: string; layerId: string }
  | { kind: 'setLayerVisible'; id: string; layerId: string; visible: boolean }
  | { kind: 'setLayerOpacity'; id: string; layerId: string; opacity: number };

export type Op = StrokeOp | FillOp | LayerOp;

export type LayerSnapshot = {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  locked: boolean;
};

export type DocumentMeta = {
  id: string;
  name: string;
  width: number;
  height: number;
  createdAt: number;
  updatedAt: number;
  templateId?: string;
};
