class apiResponse {
  constructor(statusCode, data = {}, message = 'Success') {
    this.success = statusCode < 400;
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
  }
}

export { apiResponse };
