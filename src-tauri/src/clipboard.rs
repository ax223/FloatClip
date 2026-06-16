#[cfg(target_os = "windows")]
pub fn write_files_to_clipboard(paths: Vec<String>) -> Result<(), String> {
    use std::{ffi::OsStr, mem::size_of, os::windows::ffi::OsStrExt, ptr::copy_nonoverlapping};
    use windows::core::w;
    use windows::Win32::{
        Foundation::HANDLE,
        System::{
            DataExchange::{
                CloseClipboard, EmptyClipboard, OpenClipboard, RegisterClipboardFormatW,
                SetClipboardData,
            },
            Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE},
            Ole::CF_HDROP,
        },
        UI::Shell::DROPFILES,
    };

    if paths.is_empty() {
        return Ok(());
    }

    let mut wide_paths = Vec::<u16>::new();
    for path in paths {
        wide_paths.extend(OsStr::new(&path).encode_wide());
        wide_paths.push(0);
    }
    wide_paths.push(0);

    let header_size = size_of::<DROPFILES>();
    let bytes_len = header_size + wide_paths.len() * size_of::<u16>();

    unsafe {
        OpenClipboard(None).map_err(|e| e.to_string())?;
        EmptyClipboard().map_err(|e| e.to_string())?;

        let handle = GlobalAlloc(GMEM_MOVEABLE, bytes_len).map_err(|e| e.to_string())?;
        let ptr = GlobalLock(handle) as *mut u8;
        if ptr.is_null() {
            CloseClipboard().map_err(|e| e.to_string())?;
            return Err("GlobalLock failed".into());
        }

        let dropfiles = DROPFILES {
            pFiles: header_size as u32,
            pt: Default::default(),
            fNC: false.into(),
            fWide: true.into(),
        };

        copy_nonoverlapping(
            &dropfiles as *const DROPFILES as *const u8,
            ptr,
            header_size,
        );
        copy_nonoverlapping(
            wide_paths.as_ptr() as *const u8,
            ptr.add(header_size),
            wide_paths.len() * size_of::<u16>(),
        );

        let _ = GlobalUnlock(handle);
        SetClipboardData(CF_HDROP.0 as u32, Some(HANDLE(handle.0))).map_err(|e| e.to_string())?;

        let effect_handle =
            GlobalAlloc(GMEM_MOVEABLE, size_of::<u32>()).map_err(|e| e.to_string())?;
        let effect_ptr = GlobalLock(effect_handle) as *mut u32;
        if !effect_ptr.is_null() {
            *effect_ptr = 1;
            let _ = GlobalUnlock(effect_handle);
            let format = RegisterClipboardFormatW(w!("Preferred DropEffect"));
            let _ = SetClipboardData(format, Some(HANDLE(effect_handle.0)));
        }

        CloseClipboard().map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[cfg(target_os = "windows")]
pub fn read_files_from_clipboard() -> Result<Vec<String>, String> {
    use std::{ffi::OsString, os::windows::ffi::OsStringExt};
    use windows::Win32::{
        System::{
            DataExchange::{
                CloseClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard,
            },
            Ole::CF_HDROP,
        },
        UI::Shell::{DragQueryFileW, HDROP},
    };

    unsafe {
        if IsClipboardFormatAvailable(CF_HDROP.0 as u32).is_err() {
            return Ok(Vec::new());
        }

        OpenClipboard(None).map_err(|e| e.to_string())?;
        let handle = match GetClipboardData(CF_HDROP.0 as u32) {
            Ok(handle) => handle,
            Err(error) => {
                CloseClipboard().map_err(|e| e.to_string())?;
                return Err(error.to_string());
            }
        };

        let hdrop = HDROP(handle.0);
        let count = DragQueryFileW(hdrop, u32::MAX, None);
        let mut paths = Vec::with_capacity(count as usize);

        for index in 0..count {
            let len = DragQueryFileW(hdrop, index, None);
            if len == 0 {
                continue;
            }

            let mut buffer = vec![0u16; len as usize + 1];
            let written = DragQueryFileW(hdrop, index, Some(&mut buffer));
            if written > 0 {
                paths.push(
                    OsString::from_wide(&buffer[..written as usize])
                        .to_string_lossy()
                        .into_owned(),
                );
            }
        }

        CloseClipboard().map_err(|e| e.to_string())?;
        Ok(paths)
    }
}

#[cfg(not(target_os = "windows"))]
pub fn write_files_to_clipboard(_paths: Vec<String>) -> Result<(), String> {
    Err("file clipboard is only implemented on Windows".into())
}

#[cfg(not(target_os = "windows"))]
pub fn read_files_from_clipboard() -> Result<Vec<String>, String> {
    Ok(Vec::new())
}
