import { AggregateRoot } from '../../../shared/domain/aggregate-root.js';
import {
    optionalDescription,
    requireName,
    requirePriceCents,
    SERVICE_NAME_MAX_LENGTH,
} from './catalog-rules.js';
import { ServiceTypeId } from './service-type-id.js';
import { ServiceId } from './service-id.js';

export interface ServiceProps {
    id?: ServiceId | string | undefined;
    name: string;
    description?: string | null | undefined;
    priceCents: number;
    serviceTypeId: ServiceTypeId | string;
    version?: number | undefined;
}

export interface ServiceChanges {
    name: string;
    description?: string | null | undefined;
    priceCents: number;
    serviceTypeId: ServiceTypeId | string;
}

/** Serviço oferecido pela oficina (ex.: troca de óleo), com preço de tabela. */
export class Service extends AggregateRoot<ServiceId> {
    private _name!: string;
    private _description!: string | null;
    private _priceCents!: number;
    private _serviceTypeId!: ServiceTypeId;

    private constructor(
        id: ServiceId,
        changes: ServiceChanges,
        version: number,
    ) {
        super(id, version);
        this.apply(changes);
    }

    get name(): string {
        return this._name;
    }

    get description(): string | null {
        return this._description;
    }

    get priceCents(): number {
        return this._priceCents;
    }

    get serviceTypeId(): ServiceTypeId {
        return this._serviceTypeId;
    }

    static create(props: ServiceProps): Service {
        const id =
            props.id instanceof ServiceId ? props.id : new ServiceId(props.id);
        return new Service(id, props, props.version ?? 0);
    }

    update(changes: ServiceChanges): void {
        this.apply(changes);
    }

    private apply(changes: ServiceChanges): void {
        const name = requireName(changes.name, SERVICE_NAME_MAX_LENGTH);
        const description = optionalDescription(changes.description);
        const priceCents = requirePriceCents(changes.priceCents);
        const serviceTypeId =
            changes.serviceTypeId instanceof ServiceTypeId
                ? changes.serviceTypeId
                : new ServiceTypeId(changes.serviceTypeId);
        this._name = name;
        this._description = description;
        this._priceCents = priceCents;
        this._serviceTypeId = serviceTypeId;
    }
}
