import { Customer } from '../../../registry/domain/customer/customer.js';
import { CpfCnpj } from '../../../registry/domain/customer/value-objects/cpf-cnpj.js';
import { Email } from '../../../registry/domain/customer/value-objects/email.js';
import { Telephone } from '../../../registry/domain/customer/value-objects/telephone.js';
import { Vehicle } from '../../../registry/domain/vehicle/vehicle.js';
import { Plate } from '../../../registry/domain/vehicle/value-objects/plate.js';
import { cliente, veiculo } from '../schema.js';

type CustomerRow = typeof cliente.$inferSelect;
type CustomerInsert = typeof cliente.$inferInsert;
type VehicleRow = typeof veiculo.$inferSelect;
type VehicleInsert = typeof veiculo.$inferInsert;

export function customerFromRow(row: CustomerRow): Customer {
    return Customer.create({
        cpfCnpj: CpfCnpj.create(row.clienteId),
        name: row.nome,
        email: Email.create(row.email),
        tel: Telephone.create(row.telefone),
        version: row.version,
    });
}

export function customerToRow(customer: Customer): CustomerInsert {
    return {
        clienteId: customer.cpfCnpj.value,
        nome: customer.name,
        telefone: customer.tel.value,
        email: customer.email.value,
        version: customer.version,
    };
}

export function vehicleFromRow(row: VehicleRow): Vehicle {
    return Vehicle.create({
        id: row.veiculoId,
        customerId: CpfCnpj.create(row.clienteId),
        model: row.modelo,
        year: row.ano,
        brand: row.marca,
        color: row.cor,
        plate: Plate.create(row.placa),
        version: row.version,
    });
}

export function vehicleToRow(vehicle: Vehicle): VehicleInsert {
    return {
        veiculoId: vehicle.id.value,
        placa: vehicle.plate.value,
        modelo: vehicle.model,
        ano: vehicle.year,
        marca: vehicle.brand,
        cor: vehicle.color,
        version: vehicle.version,
        clienteId: vehicle.customerId.value,
    };
}
