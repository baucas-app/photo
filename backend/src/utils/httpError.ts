export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const BadRequest = (message: string) => new HttpError(400, message);
export const Unauthorized = (message = "Unauthorized") => new HttpError(401, message);
export const Forbidden = (message = "Forbidden") => new HttpError(403, message);
export const NotFound = (message: string) => new HttpError(404, message);
export const Conflict = (message: string) => new HttpError(409, message);
