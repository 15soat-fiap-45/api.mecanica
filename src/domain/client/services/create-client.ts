import type { CreateClientDTO } from '../dto/create-client-dto.js';
import { ClientAlreadyExistsError } from '../exceptions/client-already-exists-error.js';
import type { ClientRepository } from '../repositories/client-repository.js';

export class CreateClient {
    constructor(private clientRepository: ClientRepository) {}

    async execute({
        cpfCnpj,
        name,
        email,
        tel,
    }: CreateClientDTO): Promise<void> {
        const existingClient =
            await this.clientRepository.findByCpfCnpj(cpfCnpj);
        if (existingClient) {
            throw new ClientAlreadyExistsError();
        }
        const client = {
            cpfCnpj,
            name,
            email,
            tel,
        };

        await this.clientRepository.save(client);
    }
}
