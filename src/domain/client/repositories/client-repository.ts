import type { Client } from '../entities/client.ts';

export interface ClientRepository {
    save(client: Client): Promise<void>;
    findByCpfCnpj(cpfCnpj: string): Promise<Client | null>;
}
