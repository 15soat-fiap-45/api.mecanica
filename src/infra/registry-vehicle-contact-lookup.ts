import type { VehicleContactLookup } from '../service-order/application/ports/vehicle-contact.js';
import type { CustomerRepository } from '../registry/domain/customer/customer.repository.js';
import type { VehicleRepository } from '../registry/domain/vehicle/vehicle.repository.js';

export class RegistryVehicleContactLookup implements VehicleContactLookup {
    constructor(
        private readonly vehicles: VehicleRepository,
        private readonly customers: CustomerRepository,
    ) {}

    async findByVehicleId(vehicleId: string) {
        const vehicle = await this.vehicles.findById(vehicleId);
        if (!vehicle) return null;
        const customer = await this.customers.findByCpfCnpj(vehicle.customerId);
        return customer
            ? {
                  name: customer.name,
                  email: customer.email.value,
                  customerDocument: vehicle.customerId.value,
              }
            : null;
    }
}
