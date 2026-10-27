export interface TokenService {
    sign(email: string): Promise<string>;
    verify(token: string): Promise<string | null>;
}
