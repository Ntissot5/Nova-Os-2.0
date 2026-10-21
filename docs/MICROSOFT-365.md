# Microsoft 365 : l'application Nova

Pour qu'une régie connecte son Outlook (mail et agenda) en un clic, Nova doit être enregistrée **une seule fois** chez Microsoft, comme toute application. Cet enregistrement appartient à l'éditeur de Nova, pas aux clients : il sert à toutes les entreprises.

## Enregistrer l'application (une fois, 10 minutes)

1. Ouvrir le centre d'administration Microsoft Entra (entra.microsoft.com) avec un compte de l'éditeur de Nova.
2. **Applications → Inscriptions d'applications → Nouvelle inscription.**
   - Nom : `Nova OS`
   - Types de comptes : **Comptes dans un annuaire d'organisation et comptes Microsoft personnels** (pour pouvoir aussi tester avec un compte Outlook.com ; en production, les régies utilisent des comptes d'entreprise). Avec un compte personnel, déclarer aussi `nova.connectors.microsoft.tenant = "common";`.
   - URI de redirection : aucune.
3. Dans **Authentification**, activer **Autoriser les flux de clients publics** (connexion par code).
4. Dans **Autorisations de l'API → Microsoft Graph → Autorisations déléguées**, ajouter exactement :
   `User.Read`, `Mail.ReadWrite`, `Mail.Send`, `Calendars.ReadWrite`, `offline_access`.
5. Copier l'**ID d'application (client)** et le déclarer dans `company.nix` :

   ```nix
   nova.connectors.microsoft.clientId = "…";
   ```

   Ce n'est pas un secret : il n'y a ni mot de passe ni certificat, l'application est un « client public ».

6. Recommandé avant le premier client : la **vérification de l'éditeur** (Microsoft Partner). Sans elle, certaines entreprises demandent l'accord de leur administrateur Microsoft au moment de la connexion.

## Ce qui se passe chez le client

- Le dirigeant ouvre **Connecteurs → Se connecter avec Microsoft**.
- Nova affiche un code. Le dirigeant ouvre `microsoft.com/devicelogin`, tape le code, se connecte avec le compte de l'entreprise et accepte les autorisations.
- Mail et Agenda passent sur Outlook, sans redémarrage. Les agents ne voient aucune différence ; leurs brouillons apparaissent aussi dans Outlook.
- Le jeton reste sur le Hub (`/var/lib/nova/secrets/microsoft.json`, droits 0600), jamais dans `data/` ni dans l'export. Après un import, il suffit de se reconnecter.
- **Déconnecter** efface le jeton et remet les fournisseurs d'origine.

## Sécurité : jamais en démonstration

En démonstration, des scénarios écrits d'avance préparent et envoient des mails. Nova refuse donc de connecter une vraie boîte tant que la démonstration tourne : il faut `nova.demo = false`.

## Limites actuelles

- Fichiers (OneDrive, SharePoint) et Teams : pas encore.
- Le flux a été testé contre un faux Microsoft fidèle au protocole (tests `microsoft.test.ts` et `npm run test:ui`), pas encore contre un vrai compte Microsoft 365 : c'est la première chose à faire une fois l'application enregistrée.
