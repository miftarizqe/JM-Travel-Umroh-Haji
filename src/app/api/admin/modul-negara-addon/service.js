import { modulNegaraAddonRepository as repo } from './repository';

function errorDenganStatus(pesan, status) {
  const error = new Error(pesan);
  error.status = status;
  return error;
}

export const modulNegaraAddonService = {
  async daftar(modulNegaraIdMentah) {
    const modulNegaraId = Number(modulNegaraIdMentah);
    if (!modulNegaraId) throw errorDenganStatus('Parameter modul_negara_id wajib diisi', 400);
    return repo.untukModul(modulNegaraId);
  },

  async gantiSemua(modulNegaraIdMentah, addons) {
    const modulNegaraId = Number(modulNegaraIdMentah);
    if (!modulNegaraId) throw errorDenganStatus('Parameter modul_negara_id wajib diisi', 400);
    await repo.gantiSemua(modulNegaraId, addons || []);
  },
};
