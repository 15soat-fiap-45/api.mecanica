export class Client {
    readonly cpfCnpj: string;
    name: string;
    email: string;
    tel: string;

    constructor(cpfCnpj: string, name: string, email: string, tel: string) {
        this.cpfCnpj = cpfCnpj;
        this.name = name;
        this.email = email;
        this.tel = tel;
    }
}
