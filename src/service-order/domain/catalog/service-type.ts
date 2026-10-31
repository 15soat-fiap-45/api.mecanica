import { AggregateRoot } from '../../../shared/domain/aggregate-root.js';
import { requireName, SERVICE_TYPE_NAME_MAX_LENGTH } from './catalog-rules.js';
import { ServiceTypeId } from './service-type-id.js';

export interface ServiceTypeProps {
    id?: ServiceTypeId | string | undefined;
    name: string;
    version?: number | undefined;
}

/** Categoria de serviço do catálogo (ex.: Mecânica, Elétrica, Funilaria). */
export class ServiceType extends AggregateRoot<ServiceTypeId> {
    private _name: string;

    private constructor(id: ServiceTypeId, name: string, version: number) {
        super(id, version);
        this._name = requireName(name, SERVICE_TYPE_NAME_MAX_LENGTH);
    }

    get name(): string {
        return this._name;
    }

    static create(props: ServiceTypeProps): ServiceType {
        const id =
            props.id instanceof ServiceTypeId
                ? props.id
                : new ServiceTypeId(props.id);
        return new ServiceType(id, props.name, props.version ?? 0);
    }

    rename(name: string): void {
        this._name = requireName(name, SERVICE_TYPE_NAME_MAX_LENGTH);
    }
}
