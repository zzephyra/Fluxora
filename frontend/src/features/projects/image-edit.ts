import { ApiError } from "../../lib/api";

export type InpaintRequest = {
  image: Blob;
  mask: Blob;
  prompt: string;
};

export type EraseRequest = {
  image: Blob;
  mask: Blob;
};

export type OutpaintRequest = {
  image: Blob;
  width: number;
  height: number;
  imageX: number;
  imageY: number;
};

function unavailable(message: string): Promise<never> {
  return Promise.reject(
    new ApiError({
      status: 501,
      code: "not_implemented",
      message,
      details: {},
      requestId: null,
    }),
  );
}

export function requestInpaint(_input: InpaintRequest): Promise<never> {
  return unavailable("局部重绘接口尚未接入");
}

export function requestErase(_input: EraseRequest): Promise<never> {
  return unavailable("消除接口尚未接入");
}

export function requestOutpaint(_input: OutpaintRequest): Promise<never> {
  return unavailable("扩图生成尚未接入");
}
