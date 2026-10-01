import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../lib/api";
import { completeUpload, requestUploadToken } from "./api";
import { DirectUploadError, putFile } from "./qiniu";
import type { UploadTokenResponse } from "./types";
import { UploadCancelled, uploadFile } from "./upload-file";

vi.mock("./api", () => ({
  requestUploadToken: vi.fn(),
  completeUpload: vi.fn(),
}));

vi.mock("./qiniu", () => {
  class MockDirectUploadError extends Error {
    readonly reason: "token" | "network" | "provider" | "cancelled";

    constructor(reason: MockDirectUploadError["reason"], message: string) {
      super(message);
      this.name = "DirectUploadError";
      this.reason = reason;
    }
  }
  return { DirectUploadError: MockDirectUploadError, putFile: vi.fn() };
});

const tokenResponse: UploadTokenResponse = {
  token: "signed-token",
  key: "uploads/video/user/2026/09/file.mp4",
  domain: "http://cdn.example.test",
  upload_url: "https://upload-z2.qiniup.com",
  expires_in: 3600,
};

function video(): File {
  return new File([new Uint8Array([1, 2, 3, 4])], "clip.mp4", { type: "video/mp4" });
}

describe("uploadFile", () => {
  beforeEach(() => {
    vi.mocked(requestUploadToken).mockReset();
    vi.mocked(completeUpload).mockReset();
    vi.mocked(putFile).mockReset();
  });

  it("cancels the direct upload and does not complete it", async () => {
    vi.mocked(requestUploadToken).mockResolvedValue(tokenResponse);
    let started: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    vi.mocked(putFile).mockImplementation(() => {
      started();
      let rejectDone: (error: DirectUploadError) => void = () => undefined;
      const done = new Promise<void>((_resolve, reject) => {
        rejectDone = reject;
      });
      return {
        done,
        cancel() {
          rejectDone(new DirectUploadError("cancelled", "Upload cancelled"));
        },
      };
    });
    const task = uploadFile(video(), { category: "video" });
    await ready;
    task.cancel();
    await expect(task).rejects.toBeInstanceOf(UploadCancelled);
    expect(completeUpload).not.toHaveBeenCalled();
    expect(putFile).toHaveBeenCalledWith(expect.objectContaining({ file: expect.any(File) }));
  });

  it("reuses the same key after a token failure and stops after validation errors", async () => {
    vi.mocked(requestUploadToken).mockImplementation(async (input) => ({
      ...tokenResponse,
      key: input.key ?? tokenResponse.key,
    }));
    vi.mocked(putFile)
      .mockImplementationOnce(() => ({
        done: Promise.reject(new DirectUploadError("token", "expired")),
        cancel() {
          return undefined;
        },
      }))
      .mockImplementationOnce(() => ({
        done: Promise.resolve(),
        cancel() {
          return undefined;
        },
      }));
    vi.mocked(completeUpload).mockResolvedValue({
      id: "file-id",
      key: tokenResponse.key,
      url: "http://cdn.example.test/file.mp4",
      original_filename: "clip.mp4",
      content_type: "video/mp4",
      size: 4,
      category: "video",
      status: "uploaded",
      provider: "qiniu",
      created_at: "",
      updated_at: "",
    });
    const result = await uploadFile(video(), { category: "video" });
    expect(result.key).toBe(tokenResponse.key);
    expect(vi.mocked(requestUploadToken).mock.calls[1]?.[0].key).toBe(tokenResponse.key);
    expect(putFile).toHaveBeenCalledTimes(2);

    vi.mocked(requestUploadToken).mockClear();
    vi.mocked(putFile).mockReset();
    vi.mocked(putFile).mockImplementation(() => ({
      done: Promise.resolve(),
      cancel() {
        return undefined;
      },
    }));
    vi.mocked(completeUpload).mockRejectedValue(
      new ApiError({
        status: 422,
        code: "validation_error",
        message: "rejected",
        details: {},
        requestId: null,
      }),
    );
    await expect(uploadFile(video(), { category: "video" })).rejects.toMatchObject({
      code: "validation_error",
    });
    expect(requestUploadToken).toHaveBeenCalledTimes(1);
  });
});
