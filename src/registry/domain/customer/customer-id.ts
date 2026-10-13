import { CpfCnpj } from './value-objects/cpf-cnpj.js';

/**
 * Customer aggregate identity.
 * In this domain, Customer uses the natural key CpfCnpj as its primary identifier.
 */
export type CustomerId = CpfCnpj;
export const CustomerId = CpfCnpj;
