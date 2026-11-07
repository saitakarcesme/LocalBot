import AppKit

/// In-process picker: avoids Tahoe's remote NSOpenPanel service initialization hang.
/// Never reads file contents; only the URLs explicitly chosen by the user are returned.
@MainActor final class LocalFilePicker: NSObject, NSTableViewDataSource, NSTableViewDelegate, NSWindowDelegate {
 private let panel=NSPanel(contentRect:NSRect(x:0,y:0,width:640,height:480),styleMask:[.titled,.closable,.resizable],backing:.buffered,defer:false)
 private let table=NSTableView(), path=NSTextField(), status=NSTextField(labelWithString:""), choose=NSButton(title:"Choose",target:nil,action:nil)
 private var entries:[(url:URL,folder:Bool)]=[], directory=FileManager.default.homeDirectoryForCurrentUser, generation=0
 private var completion:(([URL]?)->Void)?
 private let multiple:Bool
 init(multiple:Bool,completion:@escaping([URL]?)->Void) {
  self.multiple=multiple;self.completion=completion;super.init()
  panel.title="Choose files";panel.minSize=NSSize(width:440,height:320);panel.delegate=self
  let content=panel.contentView!, column=NSTableColumn(identifier:NSUserInterfaceItemIdentifier("name"));column.title="Name";table.addTableColumn(column)
  table.headerView=nil;table.rowHeight=30;table.allowsMultipleSelection=multiple;table.delegate=self;table.dataSource=self;table.target=self;table.doubleAction=#selector(openSelection)
  table.setAccessibilityLabel("Files")
  let scroll=NSScrollView();scroll.documentView=table;scroll.hasVerticalScroller=true;scroll.borderType = .bezelBorder
  path.placeholderString="Folder or file path";path.setAccessibilityLabel("Folder or file path");path.target=self;path.action=#selector(go)
  let up=NSButton(title:"↑",target:self,action:#selector(parentFolder));up.setAccessibilityLabel("Parent folder")
  let goButton=NSButton(title:"Go",target:self,action:#selector(go))
  let address=NSStackView(views:[up,path,goButton]);address.orientation = .horizontal;address.spacing=8;path.setContentHuggingPriority(.defaultLow,for:.horizontal)
  let home=NSButton(title:"Home",target:self,action:#selector(homeFolder)),downloads=NSButton(title:"Downloads",target:self,action:#selector(downloadsFolder)),desktop=NSButton(title:"Desktop",target:self,action:#selector(desktopFolder))
  let places=NSStackView(views:[home,downloads,desktop]);places.orientation = .horizontal;places.spacing=8
  choose.target=self;choose.action=#selector(accept);choose.keyEquivalent="\r";choose.isEnabled=false
  let cancel=NSButton(title:"Cancel",target:self,action:#selector(cancelSelection));cancel.keyEquivalent="\u{1b}"
  let footer=NSStackView(views:[status,cancel,choose]);footer.orientation = .horizontal;footer.spacing=10;status.setContentHuggingPriority(.defaultLow,for:.horizontal);status.font = .systemFont(ofSize:11);status.textColor = .secondaryLabelColor
  let stack=NSStackView(views:[address,places,scroll,footer]);stack.orientation = .vertical;stack.alignment = .leading;stack.spacing=12;stack.translatesAutoresizingMaskIntoConstraints=false;content.addSubview(stack)
  NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo:content.leadingAnchor,constant:16),stack.trailingAnchor.constraint(equalTo:content.trailingAnchor,constant:-16),stack.topAnchor.constraint(equalTo:content.topAnchor,constant:16),stack.bottomAnchor.constraint(equalTo:content.bottomAnchor,constant:-16),address.widthAnchor.constraint(equalTo:stack.widthAnchor),scroll.widthAnchor.constraint(equalTo:stack.widthAnchor),footer.widthAnchor.constraint(equalTo:stack.widthAnchor)])
 }
 func show(on parent:NSWindow){parent.beginSheet(panel);load(directory)}
 private func load(_ url:URL){
  generation+=1;let request=generation;directory=url.standardizedFileURL;path.stringValue=directory.path;status.stringValue="Loading…";choose.isEnabled=false
  let target=directory
  DispatchQueue.global(qos:.userInitiated).async {
   let result=Result {try FileManager.default.contentsOfDirectory(at:target,includingPropertiesForKeys:[.isDirectoryKey],options:[.skipsHiddenFiles]).prefix(5000).map {url in (url:url,folder:(try? url.resourceValues(forKeys:[.isDirectoryKey]).isDirectory) == true)}.sorted {a,b in a.folder == b.folder ? a.url.lastPathComponent.localizedStandardCompare(b.url.lastPathComponent) == .orderedAscending : a.folder}}
   DispatchQueue.main.async {[weak self] in
    guard let self,self.generation==request,self.completion != nil else{return}
    switch result {case .success(let list): self.entries=list;self.status.stringValue="\(list.count) items · Double-click a folder to open it"
    case .failure(let error):self.entries=[];self.status.stringValue=error.localizedDescription}
    self.table.reloadData();self.table.deselectAll(nil)
   }
  }
 }
 func numberOfRows(in tableView:NSTableView)->Int{entries.count}
 func tableView(_ tableView:NSTableView,viewFor tableColumn:NSTableColumn?,row:Int)->NSView?{
  let entry=entries[row],cell=NSTableCellView(),label=NSTextField(labelWithString:entry.url.lastPathComponent),icon=NSImageView()
  icon.image=NSImage(systemSymbolName:entry.folder ? "folder" : "doc",accessibilityDescription:entry.folder ? "Folder" : "File");icon.frame=NSRect(x:6,y:6,width:18,height:18)
  label.frame=NSRect(x:32,y:6,width:max(100,tableView.bounds.width-40),height:20);label.lineBreakMode = .byTruncatingMiddle;label.autoresizingMask=[.width];cell.addSubview(icon);cell.addSubview(label);cell.textField=label;return cell
 }
 func tableViewSelectionDidChange(_ notification:Notification){choose.isEnabled=table.selectedRowIndexes.contains{entries.indices.contains($0) && !entries[$0].folder}}
 @objc private func parentFolder(){load(directory.deletingLastPathComponent())}
 @objc private func homeFolder(){load(FileManager.default.homeDirectoryForCurrentUser)}
 @objc private func downloadsFolder(){load(FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Downloads"))}
 @objc private func desktopFolder(){load(FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Desktop"))}
 @objc private func go(){
  let input=(path.stringValue as NSString).expandingTildeInPath
  let url=input.hasPrefix("/") ? URL(fileURLWithPath:input) : directory.appendingPathComponent(input)
  var isDirectory:ObjCBool=false
  if FileManager.default.fileExists(atPath:url.path,isDirectory:&isDirectory){if isDirectory.boolValue{load(url)}else{finish([url])}}
  else{status.stringValue="This path does not exist."}
 }
 @objc private func openSelection(){let row=table.clickedRow;guard entries.indices.contains(row)else{return};if entries[row].folder{load(entries[row].url)}else{accept()}}
 @objc private func accept(){let urls=table.selectedRowIndexes.compactMap {entries.indices.contains($0) && !entries[$0].folder ? entries[$0].url : nil};if !urls.isEmpty{finish(multiple ? urls : [urls[0]])}}
 @objc private func cancelSelection(){finish(nil)}
 func windowShouldClose(_ sender:NSWindow)->Bool{finish(nil);return false}
 private func finish(_ urls:[URL]?){guard let done=completion else{return};completion=nil;generation+=1;panel.sheetParent?.endSheet(panel);panel.orderOut(nil);done(urls)}
}
