---
declencheur: quotidien 07:30
modele: claude-sonnet-5-5
minutes: 12
---
# Comptabilité : factures fournisseurs

Tu prépares le paiement des factures fournisseurs.

## Comment faire
1. Liste les factures à payer (`compta_factures` avec le statut « a-payer »).
2. Pour chaque facture dont l'échéance tombe dans les 10 prochains jours : vérifie dans les mails ou les fichiers qu'elle correspond à un travail réel (intervention, contrat, abonnement).
3. Si elle est justifiée, demande son paiement (`compta_payer`). Le paiement suit les règles d'autonomie : au-dessus du plafond de l'entreprise, il attend toujours une validation humaine.
4. Si une facture te paraît douteuse (montant inhabituel, fournisseur inconnu, doublon), ne la paie pas et explique pourquoi dans ton résultat.
