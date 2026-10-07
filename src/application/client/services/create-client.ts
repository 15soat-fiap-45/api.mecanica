import { CpfCnpj } from '../../../domain/client/value-objects/cpf-cnpj.js';
import { Email } from '../../../domain/client/value-objects/email.js';
import { Telephone } from '../../../domain/client/value-objects/telephone.js';
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
            cpfCnpj: CpfCnpj.create(cpfCnpj),
            name,
            email: Email.create(email),
            tel: Telephone.create(tel),
        };

        await this.clientRepository.save(client);
    }
}
