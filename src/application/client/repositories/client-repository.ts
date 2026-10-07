import type { Client } from '../../../domain/client/entities/client.js';

export interface ClientRepository {
    save(client: Client): Promise<void>;
    findByCpfCnpj(cpfCnpj: string): Promise<Client | null>;
}
