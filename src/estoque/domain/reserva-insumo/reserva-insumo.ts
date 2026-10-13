import { AggregateRoot } from '../../../shared/domain/aggregate-root.js';
import { ReservaInsumoId } from './reserva-insumo-id.js';
import { PecaInsumoId } from '../peca-insumo/peca-insumo-id.js';
import { Quantidade } from '../peca-insumo/value-objects/quantidade.js';
import { StatusReserva } from './value-objects/status-reserva.js';

export interface ReservaInsumoProps {
    id?: ReservaInsumoId | string | undefined;
    pecaInsumoId: PecaInsumoId | string;
    ordemServicoId: string;
    quantidade: Quantidade | number;
    status?: StatusReserva | undefined;
    version?: number | undefined;
}

export class ReservaInsumo extends AggregateRoot<ReservaInsumoId> {
    readonly pecaInsumoId: PecaInsumoId;
    readonly ordemServicoId: string;
    readonly quantidade: Quantidade;
    private _status: StatusReserva;

    constructor(
        id: ReservaInsumoId | string,
        pecaInsumoId: PecaInsumoId | string,
        ordemServicoId: string,
        quantidade: Quantidade | number,
        status: StatusReserva,
        version = 0,
    ) {
        const reservaInsumoId =
            id instanceof ReservaInsumoId ? id : new ReservaInsumoId(id);
        super(reservaInsumoId, version);
        this.pecaInsumoId =
            pecaInsumoId instanceof PecaInsumoId
                ? pecaInsumoId
                : new PecaInsumoId(pecaInsumoId);
        this.ordemServicoId = ordemServicoId;
        this.quantidade =
            quantidade instanceof Quantidade
                ? quantidade
                : Quantidade.create(quantidade);
        this._status = status;
    }

    get status(): StatusReserva {
        return this._status;
    }

    static create(props: ReservaInsumoProps): ReservaInsumo {
        const id =
            props.id instanceof ReservaInsumoId
                ? props.id
                : new ReservaInsumoId(props.id);
        return new ReservaInsumo(
            id,
            props.pecaInsumoId,
            props.ordemServicoId,
            props.quantidade,
            props.status ?? StatusReserva.pendente(),
            props.version ?? 0,
        );
    }

    confirmar(): void {
        this._status = this._status.transicionarPara('CONFIRMADA');
    }

    cancelar(): void {
        this._status = this._status.transicionarPara('CANCELADA');
    }

    consumir(): void {
        this._status = this._status.transicionarPara('CONSUMIDA');
    }
}
