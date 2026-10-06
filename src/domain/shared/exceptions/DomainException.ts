export abstract class DomainException extends Error {
    constructor(message: string) {
        super(message);
        this.name = new.target.name;
    }
}
