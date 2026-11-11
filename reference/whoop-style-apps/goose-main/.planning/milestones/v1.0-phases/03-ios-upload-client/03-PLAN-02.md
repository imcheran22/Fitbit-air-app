---
phase: 3
plan: 02
title: GooseAppModel+Upload.swift — hook + Info.plist mDNS
wave: 2
depends_on:
  - "03-PLAN-01"
files_modified:
  - GooseSwift/GooseAppModel+Upload.swift
  - GooseSwift/GooseAppModel.swift
  - GooseSwift/GooseAppModel+NotificationPipeline.swift
  - GooseSwift/Info.plist
autonomous: true
requirements:
  - UPLD-01
  - UPLD-06
  - UPLD-07
---

<objective>
Criar `GooseAppModel+Upload.swift` que instancia e configura o `GooseUploadService`, ligar o serviço ao hook `handleCaptureFrameWriteResult` em `GooseAppModel+NotificationPipeline.swift`, declarar a propriedade `uploadService` em `GooseAppModel.swift`, e adicionar ao `Info.plist` as chaves de rede local necessárias para comunicação mDNS (NSBonjourServices, NSLocalNetworkUsageDescription).
</objective>

<tasks>

<task id="2.1" type="execute">
<title>Declarar uploadService em GooseAppModel.swift</title>
<read_first>
- GooseSwift/GooseAppModel.swift — ler as primeiras 120 linhas para ver os padrões de declaração de propriedades `let` e instâncias de serviços como `captureFrameWriteQueue`, `rust`, `notificationFrameParser`. Confirmar o padrão de inicialização lazy vs eager.
- GooseSwift/GooseUploadService.swift — confirmar o `init(databasePath: String)` e `GooseUploadStatus` criados no PLAN-01
- GooseSwift/HealthDataStore.swift — ver `static func defaultDatabasePath()` para obter o `databasePath` correcto
</read_first>
<action>
Em `GooseSwift/GooseAppModel.swift`:

1. Adicionar a instância do upload service junto aos outros serviços (`captureFrameWriteQueue`, `rust`, etc.):
   ```swift
   let uploadService = GooseUploadService(
     databasePath: HealthDataStore.defaultDatabasePath()
   )
   ```

2. Adicionar `@Published` properties para estado do upload (necessário para Phase 4):
   ```swift
   @Published var uploadLastTimestamp: Date? = nil
   @Published var uploadPendingBatchCount: Int = 0
   ```

Posicionar `uploadService` junto a `captureFrameWriteQueue` (mesma secção de serviços de background). Posicionar as `@Published` properties junto às outras `@Published var` existentes.
</action>
<acceptance_criteria>
- `grep -n "uploadService\|GooseUploadService" GooseSwift/GooseAppModel.swift` — declaração presente
- `grep -n "uploadLastTimestamp\|uploadPendingBatchCount" GooseSwift/GooseAppModel.swift` — @Published properties presentes
- `grep -n "HealthDataStore.defaultDatabasePath" GooseSwift/GooseAppModel.swift` — database path correcto (não hardcoded)
- Projecto compila sem erros após esta edição
</acceptance_criteria>
</task>

<task id="2.2" type="execute">
<title>Criar GooseAppModel+Upload.swift com configuração do upload service</title>
<read_first>
- GooseSwift/GooseAppModel+ActivityRecording.swift — padrão de extension file por concern: `extension GooseAppModel { ... }`, como as extensions acedem ao estado partilhado (`self.ble`, `self.rust`, etc.)
- GooseSwift/GooseAppModel+NotificationPipeline.swift — ler as linhas 256–297 (função `handleCaptureFrameWriteResult` completa) para perceber onde adicionar o hook de upload
- GooseSwift/GooseUploadService.swift — confirmar assinatura de `upload(deviceID:deviceType:sinceTimestamp:)` e `onStatusUpdate`
</read_first>
<action>
Criar `GooseSwift/GooseAppModel+Upload.swift` com:

```swift
import Foundation

extension GooseAppModel {

  func configureUploadService() {
    uploadService.onStatusUpdate = { [weak self] status in
      // Called on @MainActor via DispatchQueue.main.async in GooseUploadService
      self?.uploadLastTimestamp = status.lastUploadTimestamp
      self?.uploadPendingBatchCount = status.pendingBatchCount
    }
  }

  func triggerUpload(for result: CaptureFrameWriteResult, deviceEvent: GooseNotificationEvent) {
    guard result.pass, result.errorDescription == nil else { return }
    // sinceTimestamp: 30 seconds ago covers the batch window generously
    let sinceTimestamp = Date().addingTimeInterval(-30)
    uploadService.upload(
      deviceID: deviceEvent.deviceID,
      deviceType: deviceEvent.rustDeviceType,
      sinceTimestamp: sinceTimestamp
    )
  }
}
```

**Notas de implementação:**
- `configureUploadService()` deve ser chamado em `init` de `GooseAppModel` ou em `GooseSwiftApp` (onde `GooseAppModel` é inicializado). Verificar onde `captureFrameWriteQueue` é configurado e seguir o mesmo padrão.
- `triggerUpload` é chamado de `handleCaptureFrameWriteResult` — já corre no `@MainActor`, por isso pode aceder a `uploadService.upload(...)` que internamente faz dispatch para a upload queue.
</action>
<acceptance_criteria>
- `ls GooseSwift/GooseAppModel+Upload.swift` — ficheiro existe
- `grep -n "configureUploadService\|triggerUpload" GooseSwift/GooseAppModel+Upload.swift` — ambas as funções presentes
- `grep -n "result.pass\|errorDescription == nil" GooseSwift/GooseAppModel+Upload.swift` — guard de condições de upload (UPLD-07: só faz upload quando o batch é válido)
- `grep -n "addingTimeInterval.*-30\|sinceTimestamp" GooseSwift/GooseAppModel+Upload.swift` — timestamp de lookback presente
- `grep -n "onStatusUpdate" GooseSwift/GooseAppModel+Upload.swift` — callback configurado (necessário para Phase 4)
- Projecto compila sem erros após criar este ficheiro
</acceptance_criteria>
</task>

<task id="2.3" type="execute">
<title>Ligar triggerUpload ao handleCaptureFrameWriteResult em GooseAppModel+NotificationPipeline.swift</title>
<read_first>
- GooseSwift/GooseAppModel+NotificationPipeline.swift — ler a função `handleCaptureFrameWriteResult` completa (linhas 256–297); perceber o fluxo: checa `bridgeTiming`, checa `errorDescription`, depois processa resultado válido. Também verificar se `deviceEvent` está acessível neste contexto — pode ser necessário guardar o último evento de notificação.
- GooseSwift/GooseAppModel.swift — verificar se existe campo para o último `GooseNotificationEvent` conectado, ou o `UUID` do dispositivo activo (ex: `ble.connectedPeripheral?.identifier`)
- GooseSwift/GooseBLEClient.swift — ver como `connectedPeripheral` e o deviceID activo estão expostos ao GooseAppModel
</read_first>
<action>
Em `GooseSwift/GooseAppModel+NotificationPipeline.swift`, na função `handleCaptureFrameWriteResult`:

**Estratégia para deviceID e deviceType:**
O `GooseNotificationEvent` não está disponível directamente em `handleCaptureFrameWriteResult` (este é chamado pelo `CaptureFrameWriteQueue.completion` que não passa o evento original). A solução mais limpa é guardar o último `GooseNotificationEvent` processado:

1. Em `GooseAppModel.swift`, adicionar propriedade:
   ```swift
   var lastNotificationEvent: GooseNotificationEvent?
   ```

2. Em `GooseAppModel+NotificationPipeline.swift`, no método que processa notificações BLE (onde `GooseNotificationEvent` está disponível — ex: no método que chama `captureFrameWriteQueue.enqueue`), actualizar `lastNotificationEvent`:
   ```swift
   lastNotificationEvent = event  // guardar antes do enqueue
   ```

3. Ao fim de `handleCaptureFrameWriteResult`, adicionar chamada ao upload:
   ```swift
   if result.pass, result.errorDescription == nil,
      let event = lastNotificationEvent {
     triggerUpload(for: result, deviceEvent: event)
   }
   ```

**Alternativa se lastNotificationEvent não for viável:** usar `ble.connectedDeviceID` (UUID do dispositivo conectado) e `ble.connectedDeviceType` (String "GEN4" ou "GOOSE") se estas propriedades existirem no `GooseBLEClient`. Ler `GooseBLEClient.swift` para confirmar e adaptar.

Posicionar a chamada `triggerUpload` DEPOIS do bloco `if !result.pass || !result.issues.isEmpty { ... }` e DEPOIS do `ble.record(level: .debug, ...)` final — última linha da função.
</action>
<acceptance_criteria>
- `grep -n "triggerUpload\|lastNotificationEvent" GooseSwift/GooseAppModel+NotificationPipeline.swift` — hook presente na função `handleCaptureFrameWriteResult`
- `grep -n "lastNotificationEvent" GooseSwift/GooseAppModel.swift` — propriedade declarada (se estratégia lastNotificationEvent escolhida)
- O hook `triggerUpload` está dentro de um guard `result.pass && result.errorDescription == nil` — upload só ocorre em batches válidos (UPLD-07)
- Projecto compila sem erros após esta edição
- `grep -c "triggerUpload" GooseSwift/` — aparece em GooseAppModel+Upload.swift (definição) e GooseAppModel+NotificationPipeline.swift (chamada)
</acceptance_criteria>
</task>

<task id="2.4" type="execute">
<title>Chamar configureUploadService() na inicialização do GooseAppModel</title>
<read_first>
- GooseSwift/GooseSwiftApp.swift — ver onde `GooseAppModel` é criado (`@StateObject`) e se existe um método `setup()` ou `configure()` chamado após init
- GooseSwift/GooseAppModel.swift — ver se existe um método `init()` explícito onde outros serviços são configurados (ex: `configureNotificationPipeline()`, `configureBLEClient()`)
</read_first>
<action>
Localizar onde os serviços de `GooseAppModel` são configurados após init (ex: método chamado em `GooseSwiftApp.onAppear`, ou directamente no `init()` de `GooseAppModel`).

Adicionar chamada a `configureUploadService()` nesse local, DEPOIS de todos os outros serviços serem configurados (para que `uploadService.onStatusUpdate` já tenha `self` disponível):

Se `GooseAppModel` tem `init()` explícito:
```swift
// No fim do init()
configureUploadService()
```

Se a configuração ocorre em `GooseSwiftApp`:
```swift
// Onde outros services são configurados
model.configureUploadService()
```

Seguir o padrão exacto dos outros serviços para descobrir a abordagem correcta.
</action>
<acceptance_criteria>
- `grep -rn "configureUploadService" GooseSwift/` — aparece em GooseAppModel+Upload.swift (definição) e num segundo ficheiro (chamada)
- Projecto compila sem erros após esta edição
</acceptance_criteria>
</task>

<task id="2.5" type="execute">
<title>Adicionar entradas mDNS ao Info.plist</title>
<read_first>
- GooseSwift/Info.plist — ler o ficheiro completo para confirmar que `NSAllowsLocalNetworking` já existe e ver o formato do plist (XML vs binary). Confirmar que `NSBonjourServices` ainda NÃO existe (para evitar duplicar).
- .planning/phases/03-ios-upload-client/03-CONTEXT.md — confirmar D-01: adicionar `NSBonjourServices` com `_http._tcp.` e `NSLocalNetworkUsageDescription` com texto explicativo.
</read_first>
<action>
Em `GooseSwift/Info.plist`, adicionar (em XML plist format, dentro da `<dict>` raiz):

```xml
<key>NSLocalNetworkUsageDescription</key>
<string>Goose usa a rede local para enviar dados WHOOP ao servidor pessoal</string>
<key>NSBonjourServices</key>
<array>
  <string>_http._tcp.</string>
</array>
```

**Confirmar que `NSAllowsLocalNetworking` já existe** (está presente segundo o CONTEXT.md D-01 e CLAUDE.md). Se existir, não duplicar.

**Formato:** Usar o formato XML existente do ficheiro (não converter para binary). Se o plist estiver em formato binário, usar `plutil -convert xml1 GooseSwift/Info.plist` primeiro.

Posicionar as novas chaves perto de `NSAllowsLocalNetworking` para agrupamento lógico.
</action>
<acceptance_criteria>
- `grep -n "NSLocalNetworkUsageDescription\|NSBonjourServices" GooseSwift/Info.plist` — ambas as chaves presentes
- `grep -n "_http._tcp." GooseSwift/Info.plist` — serviço Bonjour registado
- `grep -c "NSAllowsLocalNetworking" GooseSwift/Info.plist` — exactamente 1 (não duplicado)
- `grep "Goose usa a rede local\|servidor pessoal" GooseSwift/Info.plist` — texto de NSLocalNetworkUsageDescription correcto
- Projecto compila sem erros (Info.plist válido)
</acceptance_criteria>
</task>

</tasks>

<verification>
1. Build completo: `xcodebuild -project GooseSwift.xcodeproj -scheme GooseSwift -destination 'platform=iOS Simulator,name=iPhone 16' build 2>&1 | grep -E "BUILD|error:" | tail -5` — BUILD SUCCEEDED, zero erros
2. Hook ligado: `grep -rn "triggerUpload" GooseSwift/` — deve aparecer em 2 ficheiros (definição + chamada)
3. Configuração: `grep -rn "configureUploadService" GooseSwift/` — deve aparecer em 2 ficheiros (definição + chamada)
4. Info.plist: `grep -c "NSBonjourServices\|NSLocalNetworkUsageDescription" GooseSwift/Info.plist` — deve ser 2
5. Queue label: `grep "com.goose.swift.upload" GooseSwift/GooseUploadService.swift` — label correcto
6. Nenhuma chamada ao Rust bridge a partir de `@MainActor` directamente: `grep -n "rust.request\|GooseRustBridge()" GooseSwift/GooseAppModel+Upload.swift` — não deve existir (o Rust bridge é chamado dentro de `uploadQueue.async` no GooseUploadService)
</verification>

<must_haves>
<truths>
- D-03: Upload dispara em `handleCaptureFrameWriteResult` após `result.pass == true && result.errorDescription == nil` — a chamada a `triggerUpload` está dentro deste guard
- D-04: Não há coalescing — cada batch válido origina um upload imediato
- D-05: `GooseUploadService` é instância em `GooseAppModel` (não singleton) — padrão idêntico ao `CaptureFrameWriteQueue`
- D-06: A instância lê chaves da Phase 2: `RemoteServerStorage.serverURL`, `RemoteServerStorage.uploadEnabled`, `RemoteServerKeychain.loadToken()`
- D-01 (Info.plist): `NSBonjourServices` com `_http._tcp.` + `NSLocalNetworkUsageDescription` adicionados; `NSAllowsLocalNetworking` já existente e não duplicado
- UPLD-06: `triggerUpload` no @MainActor apenas despacha para `uploadQueue` — não bloqueia UI
- Phase 4 readiness: `onStatusUpdate` callback configurado; `GooseAppModel` tem `@Published uploadLastTimestamp` e `@Published uploadPendingBatchCount` prontos para FEED-03 e FEED-04
- Arquitectura anti-pattern evitada: GooseRustBridge NÃO é chamado de `@MainActor` directamente — está dentro de `performUpload` que corre na `uploadQueue`
</truths>
</must_haves>
