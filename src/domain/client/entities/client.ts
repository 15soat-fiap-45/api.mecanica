import type { CpfCnpj } from '../value-objects/cpf-cnpj.js';
import type { Email } from '../value-objects/email.js';
import type { Telephone } from '../value-objects/telephone.js';

export class Client {
    readonly cpfCnpj: CpfCnpj;
    name: string;
    email: Email;
    tel: Telephone;

    constructor(cpfCnpj: CpfCnpj, name: string, email: Email, tel: Telephone) {
        this.cpfCnpj = cpfCnpj;
        this.name = name;
        this.email = email;
        this.tel = tel;
    }
}
