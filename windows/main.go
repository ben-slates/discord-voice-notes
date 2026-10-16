package main

import (
	"bufio"
	"embed"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

//go:embed embed/dist/* embed/plugin/* embed/themes/* embed/themes/assets/*
var embeddedAssets embed.FS

const (
	banner = `
==================================================================
   Discord Voice Notes & Vencord Setup Tool for Windows
==================================================================
`
)

type DiscordInstall struct {
	Name          string
	Path          string
	ResourcesPath string
	AppAsar       string
	OrigAsar      string
	IsPatched     bool
}

func main() {
	args := os.Args[1:]
	if len(args) > 0 {
		nonInteractive := false
		for _, arg := range args {
			if arg == "-y" || arg == "--yes" || arg == "--silent" || arg == "--non-interactive" {
				nonInteractive = true
				break
			}
		}

		var reader *bufio.Reader
		if !nonInteractive {
			reader = bufio.NewReader(os.Stdin)
		}

		firstArg := strings.ToLower(args[0])
		switch firstArg {
		case "-1", "--install", "-i", "--standard":
			doInstall(false, reader)
			return
		case "-2", "--nitro", "-n", "--fake-nitro":
			doInstall(true, reader)
			return
		case "-3", "--themes", "-t":
			doInstallThemes(reader)
			return
		case "-4", "--doctor", "-d", "--diagnostics":
			doDoctor(reader)
			return
		case "-5", "--restore", "-r", "--revert", "--unpatch":
			doRestore(reader)
			return
		case "-h", "--help", "/?":
			fmt.Println("Discord Voice Notes & Vencord Setup Tool for Windows")
			fmt.Println("")
			fmt.Println("Usage: DiscordVoiceNotesInstaller.exe [OPTION]")
			fmt.Println("")
			fmt.Println("Options:")
			fmt.Println("  --install, -1, -i    Install Voice Notes & Vencord Runtime")
			fmt.Println("  --nitro, -2, -n      Install Voice Notes + Free Nitro (FakeNitro)")
			fmt.Println("  --themes, -3, -t     Install 83 Modern Full HD Themes")
			fmt.Println("  --doctor, -4, -d     Run System Diagnostics")
			fmt.Println("  --restore, -5, -r    Restore Vanilla Discord (Unpatch)")
			fmt.Println("  --silent, -y         Run unattended without interactive prompts")
			fmt.Println("  --help, -h           Show this help message")
			return
		}
	}

	reader := bufio.NewReader(os.Stdin)

	for {
		clearScreen()
		fmt.Print(banner)
		fmt.Println("Select an option:")
		fmt.Println("  [1] Install Discord Voice Notes & Vencord (Standard)")
		fmt.Println("  [2] Install Voice Notes + Enable Free Nitro (FakeNitro & Profile Themes)")
		fmt.Println("  [3] Install Custom Themes (83 Full HD Themes with Voice Channels & Chat Styling)")
		fmt.Println("  [4] Run System Diagnostics (Doctor)")
		fmt.Println("  [5] Restore Vanilla Discord (Unpatch / Revert)")
		fmt.Println("  [6] Exit")
		fmt.Println("")
		fmt.Print("Enter your choice (1-6): ")

		input, _ := reader.ReadString('\n')
		choice := strings.TrimSpace(input)

		switch choice {
		case "1":
			doInstall(false, reader)
		case "2":
			doInstall(true, reader)
		case "3":
			doInstallThemes(reader)
		case "4":
			doDoctor(reader)
		case "5":
			doRestore(reader)
		case "6":
			fmt.Println("\nExiting. Have a great day!")
			return
		default:
			fmt.Println("\nInvalid choice. Please select 1 through 6.")
			time.Sleep(1 * time.Second)
		}
	}
}

func clearScreen() {
	cmd := exec.Command("cmd", "/c", "cls")
	cmd.Stdout = os.Stdout
	_ = cmd.Run()
}

func pause(reader *bufio.Reader) {
	if reader == nil {
		return
	}
	fmt.Print("\nPress [Enter] to continue...")
	_, _ = reader.ReadString('\n')
}

func getAppData() string {
	appData := os.Getenv("APPDATA")
	if appData == "" {
		home, _ := os.UserHomeDir()
		appData = filepath.Join(home, "AppData", "Roaming")
	}
	return appData
}

func getLocalAppData() string {
	localAppData := os.Getenv("LOCALAPPDATA")
	if localAppData == "" {
		home, _ := os.UserHomeDir()
		localAppData = filepath.Join(home, "AppData", "Local")
	}
	return localAppData
}

func parseVersion(dirName string) []int {
	trimmed := strings.TrimPrefix(dirName, "app-")
	parts := strings.Split(trimmed, ".")
	var nums []int
	for _, p := range parts {
		if n, err := strconv.Atoi(p); err == nil {
			nums = append(nums, n)
		} else {
			nums = append(nums, 0)
		}
	}
	return nums
}

func compareVersions(v1, v2 string) int {
	p1 := parseVersion(v1)
	p2 := parseVersion(v2)
	maxLen := len(p1)
	if len(p2) > maxLen {
		maxLen = len(p2)
	}
	for i := 0; i < maxLen; i++ {
		n1, n2 := 0, 0
		if i < len(p1) {
			n1 = p1[i]
		}
		if i < len(p2) {
			n2 = p2[i]
		}
		if n1 > n2 {
			return 1
		}
		if n1 < n2 {
			return -1
		}
	}
	return 0
}

func findDiscordInstalls() []DiscordInstall {
	localAppData := getLocalAppData()
	branches := []struct {
		folder string
		name   string
	}{
		{"Discord", "Discord (Stable)"},
		{"DiscordCanary", "Discord Canary"},
		{"DiscordPTB", "Discord PTB"},
		{"DiscordDevelopment", "Discord Development"},
	}

	candidateBases := []string{localAppData}

	// Also check if C:\Users contains other user profiles with Discord (e.g. if run as Administrator)
	usersDir := `C:\Users`
	if uEntries, err := os.ReadDir(usersDir); err == nil {
		for _, u := range uEntries {
			if !u.IsDir() {
				continue
			}
			uName := strings.ToLower(u.Name())
			if uName == "public" || uName == "default" || uName == "default user" || uName == "all users" {
				continue
			}
			userLocal := filepath.Join(usersDir, u.Name(), "AppData", "Local")
			if !strings.EqualFold(userLocal, localAppData) {
				candidateBases = append(candidateBases, userLocal)
			}
		}
	}

	var results []DiscordInstall
	seenPaths := make(map[string]bool)

	for _, baseDir := range candidateBases {
		for _, b := range branches {
			branchDir := filepath.Join(baseDir, b.folder)
			if _, err := os.Stat(branchDir); os.IsNotExist(err) {
				continue
			}

			entries, err := os.ReadDir(branchDir)
			if err != nil {
				continue
			}

			var appFolders []string
			for _, e := range entries {
				if e.IsDir() && strings.HasPrefix(e.Name(), "app-") {
					appFolders = append(appFolders, e.Name())
				}
			}

			// Sort versions descending (newest first)
			for i := 0; i < len(appFolders); i++ {
				for j := i + 1; j < len(appFolders); j++ {
					if compareVersions(appFolders[i], appFolders[j]) < 0 {
						appFolders[i], appFolders[j] = appFolders[j], appFolders[i]
					}
				}
			}

			for _, appName := range appFolders {
				resDir := filepath.Join(branchDir, appName, "resources")
				if _, err := os.Stat(resDir); os.IsNotExist(err) {
					continue
				}

				appAsar := filepath.Join(resDir, "app.asar")
				origAsar := filepath.Join(resDir, "_app.asar")
				if seenPaths[appAsar] {
					continue
				}
				seenPaths[appAsar] = true

				isPatched := false
				if _, err := os.Stat(origAsar); err == nil {
					isPatched = true
				}

				results = append(results, DiscordInstall{
					Name:          fmt.Sprintf("%s (%s)", b.name, appName),
					Path:          filepath.Join(branchDir, appName),
					ResourcesPath: resDir,
					AppAsar:       appAsar,
					OrigAsar:      origAsar,
					IsPatched:     isPatched,
				})
			}
		}
	}

	return results
}

func closeDiscordIfRunning(nonInteractive bool, reader *bufio.Reader) {
	processNames := []string{"Discord.exe", "DiscordCanary.exe", "DiscordPTB.exe", "DiscordDevelopment.exe"}
	cmd := exec.Command("tasklist")
	output, err := cmd.Output()
	if err == nil {
		outLower := strings.ToLower(string(output))
		found := false
		for _, p := range processNames {
			if strings.Contains(outLower, strings.ToLower(p)) {
				found = true
				break
			}
		}

		if found {
			fmt.Println("\n[!] Discord appears to be currently running.")
			doClose := nonInteractive
			if !nonInteractive && reader != nil {
				fmt.Print("    Would you like to automatically close Discord now? (Y/n): ")
				input, _ := reader.ReadString('\n')
				ans := strings.ToLower(strings.TrimSpace(input))
				if ans == "" || ans == "y" || ans == "yes" {
					doClose = true
				}
			}

			if doClose {
				fmt.Println("    Closing Discord processes...")
				for _, p := range processNames {
					_ = exec.Command("taskkill", "/F", "/IM", p, "/T").Run()
				}

				// Wait for processes to exit and release file handles
				for i := 0; i < 8; i++ {
					time.Sleep(500 * time.Millisecond)
					checkCmd := exec.Command("tasklist")
					if chkOut, chkErr := checkCmd.Output(); chkErr == nil {
						chkLower := strings.ToLower(string(chkOut))
						stillRunning := false
						for _, p := range processNames {
							if strings.Contains(chkLower, strings.ToLower(p)) {
								stillRunning = true
								break
							}
						}
						if !stillRunning {
							break
						}
					}
				}
				fmt.Println("    [OK] Discord closed.")
			}
		}
	}
}

func safeRename(src, dst string) error {
	var err error
	for i := 0; i < 8; i++ {
		err = os.Rename(src, dst)
		if err == nil {
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return err
}

func safeRemove(path string) error {
	var err error
	for i := 0; i < 8; i++ {
		err = os.Remove(path)
		if err == nil || os.IsNotExist(err) {
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return err
}

func copyEmbedDir(srcDir string, destDir string) error {
	if err := os.MkdirAll(destDir, 0755); err != nil {
		return err
	}

	return fs.WalkDir(embeddedAssets, srcDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}

		relPath, _ := filepath.Rel(srcDir, path)
		targetFile := filepath.Join(destDir, relPath)
		_ = os.MkdirAll(filepath.Dir(targetFile), 0755)

		data, err := embeddedAssets.ReadFile(path)
		if err != nil {
			return err
		}

		return os.WriteFile(targetFile, data, 0644)
	})
}

func writeAppAsar(outFile string, patcherPath string) error {
	patcherPath = filepath.ToSlash(patcherPath)

	pkgJson := "{\n\t\"name\": \"discord\",\n\t\"main\": \"index.js\"\n}"
	indexJs := fmt.Sprintf("require(%q);\n", patcherPath)
	indexBytes := []byte(indexJs)
	pkgBytes := []byte(pkgJson)

	fileContents := string(append(indexBytes, pkgBytes...))

	type asarEntry struct {
		Size   int32  `json:"size"`
		Offset string `json:"offset"`
	}

	header := map[string]map[string]asarEntry{
		"files": {
			"index.js": {
				Size:   int32(len(indexBytes)),
				Offset: "0",
			},
			"package.json": {
				Size:   int32(len(pkgBytes)),
				Offset: strconv.Itoa(len(indexBytes)),
			},
		},
	}

	headerBytes, _ := json.Marshal(header)
	headerString := string(headerBytes)
	headerStringSize := uint32(len(headerString))
	dataSize := uint32(4)
	alignedSize := (headerStringSize + dataSize - 1) & ^(dataSize - 1)
	headerSize := alignedSize + 8
	headerObjectSize := alignedSize + dataSize
	diff := alignedSize - headerStringSize
	if diff > 0 {
		headerString += strings.Repeat("0", int(diff))
	}

	f, err := os.Create(outFile)
	if err != nil {
		return fmt.Errorf("failed to create %s: %w", outFile, err)
	}
	defer f.Close()

	for _, n := range []uint32{dataSize, headerSize, headerObjectSize, headerStringSize} {
		if err = binary.Write(f, binary.LittleEndian, int32(n)); err != nil {
			return fmt.Errorf("failed to write asar header: %w", err)
		}
	}

	for _, s := range []string{headerString, fileContents} {
		if _, err = f.WriteString(s); err != nil {
			return fmt.Errorf("failed to write asar data: %w", err)
		}
	}

	return nil
}

func getStartupFolder() string {
	appData := getAppData()
	return filepath.Join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup")
}

func installStartupPersistence() {
	startupDir := getStartupFolder()
	_ = os.MkdirAll(startupDir, 0755)
	vbsPath := filepath.Join(startupDir, "DiscordVoiceNotesAutoPatch.vbs")

	vbsContent := `' Discord Voice Notes - Auto-Patch Persistence across Windows Reboots
On Error Resume Next
Set fso = CreateObject("Scripting.FileSystemObject")
Set wsh = CreateObject("WScript.Shell")
localApp = wsh.ExpandEnvironmentStrings("%LOCALAPPDATA%")
appData = wsh.ExpandEnvironmentStrings("%APPDATA%")

loaderPath = appData & "\Vencord\loader\app.asar"
If Not fso.FileExists(loaderPath) Then WScript.Quit

branches = Array("Discord", "DiscordCanary", "DiscordPTB", "DiscordDevelopment")
For Each b In branches
    baseDir = localApp & "\" & b
    If fso.FolderExists(baseDir) Then
        Set folder = fso.GetFolder(baseDir)
        For Each subF In folder.SubFolders
            If LCase(Left(subF.Name, 4)) = "app-" Then
                resDir = subF.Path & "\resources"
                If fso.FolderExists(resDir) Then
                    appAsar = resDir & "\app.asar"
                    origAsar = resDir & "\_app.asar"
                    If fso.FileExists(appAsar) And Not fso.FileExists(origAsar) Then
                        fso.MoveFile appAsar, origAsar
                        fso.CopyFile loaderPath, appAsar, True
                    End If
                End If
            End If
        Next
    End If
Next
`
	if err := os.WriteFile(vbsPath, []byte(vbsContent), 0644); err == nil {
		fmt.Println("    [OK] Windows startup auto-patch persistence installed.")
		fmt.Printf("         %s\n", vbsPath)
	}
}

func removeStartupPersistence() {
	startupDir := getStartupFolder()
	vbsPath := filepath.Join(startupDir, "DiscordVoiceNotesAutoPatch.vbs")
	if _, err := os.Stat(vbsPath); err == nil {
		_ = os.Remove(vbsPath)
		fmt.Println("    [OK] Removed Windows startup auto-patch persistence.")
	}
}

func updateSettings(enableFakeNitro bool) error {
	appData := getAppData()
	vencordDir := filepath.Join(appData, "Vencord")
	settingsPaths := []string{
		filepath.Join(vencordDir, "settings", "settings.json"),
		filepath.Join(vencordDir, "settings.json"),
	}

	for _, sPath := range settingsPaths {
		_ = os.MkdirAll(filepath.Dir(sPath), 0755)

		settings := make(map[string]interface{})
		if data, err := os.ReadFile(sPath); err == nil {
			_ = json.Unmarshal(data, &settings)
		}

		plugins, ok := settings["plugins"].(map[string]interface{})
		if !ok {
			plugins = make(map[string]interface{})
		}

		// Enable VoiceMessages
		vm, _ := plugins["VoiceMessages"].(map[string]interface{})
		if vm == nil {
			vm = make(map[string]interface{})
		}
		vm["enabled"] = true
		plugins["VoiceMessages"] = vm

		// Enable SplitLargeMessages (unlimited character message sending)
		slm, _ := plugins["SplitLargeMessages"].(map[string]interface{})
		if slm == nil {
			slm = make(map[string]interface{})
		}
		slm["enabled"] = true
		plugins["SplitLargeMessages"] = slm

		// Enable CatboxUploadButton (unlimited large file uploads up to 200MB+)
		cub, _ := plugins["CatboxUploadButton"].(map[string]interface{})
		if cub == nil {
			cub = make(map[string]interface{})
		}
		cub["enabled"] = true
		plugins["CatboxUploadButton"] = cub

		// Enable DMArchive (visual transcript & structured JSON export)
		dma, _ := plugins["DMArchive"].(map[string]interface{})
		if dma == nil {
			dma = make(map[string]interface{})
		}
		dma["enabled"] = true
		plugins["DMArchive"] = dma

		if enableFakeNitro {
			fn, _ := plugins["FakeNitro"].(map[string]interface{})
			if fn == nil {
				fn = make(map[string]interface{})
			}
			fn["enabled"] = true
			fn["enableEmojiBypass"] = true
			fn["transformEmojis"] = true
			fn["enableStickerBypass"] = true
			fn["transformStickers"] = true
			fn["enableStreamQualityBypass"] = true
			fn["useHyperLinks"] = true
			plugins["FakeNitro"] = fn

			fpt, _ := plugins["FakeProfileThemes"].(map[string]interface{})
			if fpt == nil {
				fpt = make(map[string]interface{})
			}
			fpt["enabled"] = true
			plugins["FakeProfileThemes"] = fpt
		}

		settings["transparent"] = true
		settings["plugins"] = plugins
		outData, err := json.MarshalIndent(settings, "", "    ")
		if err == nil {
			_ = os.WriteFile(sPath, outData, 0644)
		}
	}

	return nil
}

func doInstallThemes(reader *bufio.Reader) {
	fmt.Println()
	fmt.Println("=======================================================")
	fmt.Println(" Installing Modernized Vencord Custom Themes on Windows")
	fmt.Println("=======================================================")
	fmt.Println()

	appData := getAppData()
	vencordThemesDir := filepath.Join(appData, "Vencord", "themes")
	vencordAssetsDir := filepath.Join(vencordThemesDir, "assets")

	_ = os.MkdirAll(vencordThemesDir, 0755)
	_ = os.MkdirAll(vencordAssetsDir, 0755)

	entries, err := embeddedAssets.ReadDir("embed/themes")
	installedCount := 0
	if err == nil {
		for _, entry := range entries {
			if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".theme.css") {
				tf := entry.Name()
				data, err := embeddedAssets.ReadFile("embed/themes/" + tf)
				if err == nil {
					dest := filepath.Join(vencordThemesDir, tf)
					if err := os.WriteFile(dest, data, 0644); err == nil {
						fmt.Println("    [OK] Installed " + tf)
						installedCount++
					}
				}
			}
		}
	}

	assetEntries, err := embeddedAssets.ReadDir("embed/themes/assets")
	if err == nil {
		for _, entry := range assetEntries {
			if !entry.IsDir() {
				af := entry.Name()
				data, err := embeddedAssets.ReadFile("embed/themes/assets/" + af)
				if err == nil {
					dest := filepath.Join(vencordAssetsDir, af)
					_ = os.WriteFile(dest, data, 0644)
				}
			}
		}
	}

	fmt.Println()
	fmt.Println("=======================================================")
	fmt.Printf(" Successfully installed %d custom themes!\n", installedCount)
	fmt.Println(" Destination: " + vencordThemesDir)
	fmt.Println("=======================================================")
	fmt.Println()
	fmt.Println("To activate:")
	fmt.Println(" 1. Open Discord.")
	fmt.Println(" 2. Go to User Settings > Vencord > Themes.")
	fmt.Println(" 3. Toggle on your chosen theme and press Ctrl+R to reload.")
	pause(reader)
}

func doInstall(enableFakeNitro bool, reader *bufio.Reader) {
	fmt.Println("\n=======================================================")
	if enableFakeNitro {
		fmt.Println(" Installing Discord Voice Notes + Free Nitro (FakeNitro)")
	} else {
		fmt.Println(" Installing Discord Voice Notes & Vencord Runtime")
	}
	fmt.Println("=======================================================")

	closeDiscordIfRunning(reader == nil, reader)

	appData := getAppData()
	vencordDir := filepath.Join(appData, "Vencord")
	vencordDist := filepath.Join(vencordDir, "dist")
	patcherJs := filepath.Join(vencordDist, "patcher.js")
	userpluginDir := filepath.Join(vencordDir, "userplugins", "DiscordVoiceNotes")

	fmt.Printf("\n--> [1/4] Deploying Vencord runtime to: %s\n", vencordDist)
	if err := copyEmbedDir("embed/dist", vencordDist); err != nil {
		fmt.Printf("    [ERROR] Failed to deploy Vencord runtime: %v\n", err)
		pause(reader)
		return
	}
	fmt.Println("    [OK] Vencord runtime files extracted successfully.")

	fmt.Printf("\n--> [2/4] Deploying DiscordVoiceNotes plugin to: %s\n", userpluginDir)
	if err := copyEmbedDir("embed/plugin", userpluginDir); err != nil {
		fmt.Printf("    [WARN] Userplugin deployment notice: %v\n", err)
	} else {
		fmt.Println("    [OK] DiscordVoiceNotes plugin files deployed.")
	}

	fmt.Println("\n--> [3/4] Configuring plugin settings...")
	_ = updateSettings(enableFakeNitro)
	fmt.Println("    [OK] VoiceMessages plugin auto-enabled.")
	fmt.Println("    [OK] SplitLargeMessages plugin auto-enabled (no character limit).")
	fmt.Println("    [OK] CatboxUploadButton plugin auto-enabled (unlimited large file uploads).")
	fmt.Println("    [OK] DMArchive plugin auto-enabled (offline DM message history export).")
	if enableFakeNitro {
		fmt.Println("    [OK] FakeNitro & FakeProfileThemes plugins auto-enabled.")
	}

	fmt.Println("\n--> [4/4] Locating and patching Discord installations...")
	installs := findDiscordInstalls()
	if len(installs) == 0 {
		fmt.Println("    [ERROR] No active Discord installation was found in %LOCALAPPDATA%\\Discord\\app-*")
		fmt.Println("    Please make sure the official Discord desktop client is installed and run at least once.")
		pause(reader)
		return
	}

	// Prepare master loader for persistence across PC restarts and Discord updates
	loaderDir := filepath.Join(vencordDir, "loader")
	_ = os.MkdirAll(loaderDir, 0755)
	masterLoader := filepath.Join(loaderDir, "app.asar")
	_ = writeAppAsar(masterLoader, patcherJs)

	patchedCount := 0
	for _, inst := range installs {
		fmt.Printf("    Found: %s\n", inst.Name)

		// If already patched, refresh it
		if inst.IsPatched {
			fmt.Printf("    Refreshing existing patch on %s...\n", inst.Name)
			_ = safeRemove(inst.AppAsar)
			_ = safeRename(inst.OrigAsar, inst.AppAsar)
		}

		if _, err := os.Stat(inst.AppAsar); os.IsNotExist(err) {
			fmt.Printf("    [WARN] app.asar not found in %s, skipping.\n", inst.ResourcesPath)
			continue
		}

		// Rename original app.asar -> _app.asar
		if err := safeRename(inst.AppAsar, inst.OrigAsar); err != nil {
			fmt.Printf("    [ERROR] Failed to backup app.asar: %v\n", err)
			continue
		}

		// Write new loader app.asar
		if err := writeAppAsar(inst.AppAsar, patcherJs); err != nil {
			fmt.Printf("    [ERROR] Failed to write loader app.asar: %v\n", err)
			_ = safeRename(inst.OrigAsar, inst.AppAsar) // rollback
			continue
		}

		fmt.Printf("    [OK] Patched successfully: %s\n", inst.Name)
		patchedCount++
	}

	if patchedCount > 0 {
		installStartupPersistence()

		fmt.Println("\n=======================================================")
		fmt.Printf(" Installation Complete! Patched %d Discord installation(s).\n", patchedCount)
		fmt.Println("=======================================================")
		fmt.Println("\nNext steps:")
		fmt.Println("  1. Launch Discord.")
		fmt.Println("  2. In any chat, right-click the '+' attachment button and click 'Send Voice Message'.")
		if enableFakeNitro {
			fmt.Println("  3. FakeNitro & Profile Themes are active!")
			fmt.Println("     - Custom emojis and 1080p 60FPS streaming are unlocked.")
		}
	} else {
		fmt.Println("\n[!] Could not patch any Discord installations. Check permissions or close Discord.")
	}

	pause(reader)
}

func doRestore(reader *bufio.Reader) {
	fmt.Println("\n=======================================================")
	fmt.Println(" Restoring Vanilla Discord (Reverting All Patches)     ")
	fmt.Println("=======================================================")

	closeDiscordIfRunning(reader == nil, reader)

	removeStartupPersistence()

	installs := findDiscordInstalls()
	restoredCount := 0

	for _, inst := range installs {
		if _, err := os.Stat(inst.OrigAsar); err == nil {
			fmt.Printf("--> Restoring %s...\n", inst.Name)
			_ = safeRemove(inst.AppAsar)
			if err := safeRename(inst.OrigAsar, inst.AppAsar); err == nil {
				fmt.Printf("    [OK] Restored original app.asar for %s\n", inst.Name)
				restoredCount++
			} else {
				fmt.Printf("    [ERROR] Failed to rename _app.asar back: %v\n", err)
			}
		}
	}

	if restoredCount > 0 {
		fmt.Printf("\n[OK] Successfully reverted %d Discord installation(s) to vanilla.\n", restoredCount)
	} else {
		fmt.Println("\n[INFO] No patched Discord installations found. Discord appears already vanilla.")
	}

	pause(reader)
}

func doDoctor(reader *bufio.Reader) {
	fmt.Println("\n=======================================================")
	fmt.Println(" System Diagnostic & Doctor Check (Windows)           ")
	fmt.Println("=======================================================")

	fmt.Println("\n1. Environment Directories:")
	appData := getAppData()
	localAppData := getLocalAppData()
	fmt.Printf("   APPDATA:      %s\n", appData)
	fmt.Printf("   LOCALAPPDATA: %s\n", localAppData)

	fmt.Println("\n2. Discord Installations:")
	installs := findDiscordInstalls()
	if len(installs) == 0 {
		fmt.Println("   [WARN] No Discord desktop client found in %LOCALAPPDATA%\\Discord\\app-*")
	} else {
		for _, inst := range installs {
			status := "Vanilla (Unmodified)"
			if inst.IsPatched {
				status = "Patched (Vencord Active)"
			}
			fmt.Printf("   - %s: %s\n", inst.Name, status)
			fmt.Printf("     Path: %s\n", inst.ResourcesPath)
		}
	}

	fmt.Println("\n3. Vencord Configuration & Status:")
	vencordDir := filepath.Join(appData, "Vencord")
	vencordDist := filepath.Join(vencordDir, "dist")
	if _, err := os.Stat(vencordDist); err == nil {
		fmt.Printf("   [OK] Vencord runtime present at: %s\n", vencordDist)
	} else {
		fmt.Println("   [INFO] Vencord runtime not yet installed.")
	}

	settingsFile := filepath.Join(vencordDir, "settings", "settings.json")
	if data, err := os.ReadFile(settingsFile); err == nil {
		var s map[string]interface{}
		_ = json.Unmarshal(data, &s)
		plugins, _ := s["plugins"].(map[string]interface{})
		vmEnabled := false
		fnEnabled := false
		if vm, ok := plugins["VoiceMessages"].(map[string]interface{}); ok {
			vmEnabled, _ = vm["enabled"].(bool)
		}
		if fn, ok := plugins["FakeNitro"].(map[string]interface{}); ok {
			fnEnabled, _ = fn["enabled"].(bool)
		}
		fmt.Printf("   [OK] VoiceMessages plugin enabled: %v\n", vmEnabled)
		fmt.Printf("   [OK] FakeNitro plugin enabled:     %v\n", fnEnabled)
	} else {
		fmt.Println("   [INFO] Settings file not yet created.")
	}

	fmt.Println("\n4. Persistence Check:")
	startupVbs := filepath.Join(getStartupFolder(), "DiscordVoiceNotesAutoPatch.vbs")
	if _, err := os.Stat(startupVbs); err == nil {
		fmt.Println("   [OK] Windows startup auto-patch persistence is ACTIVE.")
	} else {
		fmt.Println("   [INFO] Windows startup auto-patch persistence not configured (will be enabled upon install).")
	}

	pause(reader)
}
