
export class CustomHttpClient {
  get<T>(url: string): Promise<T> {
    return fetch(url).then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json() as Promise<T>;
    });
  }
}
