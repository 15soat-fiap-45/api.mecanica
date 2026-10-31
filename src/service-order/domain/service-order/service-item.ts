import { DomainException } from '../../../shared/domain/domain-exception.js';

export class InvalidServiceItemException extends DomainException {}

export interface ServiceItemProps {
    serviceId: string;
    name: string;
    priceCents: number;
}

/**
 * Internal entity of the ServiceOrder aggregate — not an aggregate root.
 * Name and price are copied from the catalog when the service is included,
 * so later catalog changes do not alter a budget already sent.
 */
export class ServiceItem {
    readonly serviceId: string;
    readonly name: string;
    readonly priceCents: number;

    private constructor(props: ServiceItemProps) {
        this.serviceId = props.serviceId;
        this.name = props.name;
        this.priceCents = props.priceCents;
    }

    static create(props: ServiceItemProps): ServiceItem {
        const serviceId =
            typeof props.serviceId === 'string' ? props.serviceId.trim() : '';
        if (!serviceId) {
            throw new InvalidServiceItemException('Service id is required');
        }
        const name = typeof props.name === 'string' ? props.name.trim() : '';
        if (!name) {
            throw new InvalidServiceItemException('Service name is required');
        }
        if (
            typeof props.priceCents !== 'number' ||
            !Number.isSafeInteger(props.priceCents) ||
            props.priceCents < 0
        ) {
            throw new InvalidServiceItemException(
                'Service price must be a non-negative integer number of cents',
            );
        }
        return new ServiceItem({
            serviceId,
            name,
            priceCents: props.priceCents,
        });
    }

    equals(other?: ServiceItem | null): boolean {
        return !!other && other.serviceId === this.serviceId;
    }
}
