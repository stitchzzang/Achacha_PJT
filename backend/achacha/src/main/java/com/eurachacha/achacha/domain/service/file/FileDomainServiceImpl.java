package com.eurachacha.achacha.domain.service.file;

import java.io.IOException;
import java.io.InputStream;
import java.util.Arrays;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import com.eurachacha.achacha.domain.model.file.File;
import com.eurachacha.achacha.domain.model.file.enums.FileType;
import com.eurachacha.achacha.web.common.exception.CustomException;
import com.eurachacha.achacha.web.common.exception.ErrorCode;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class FileDomainServiceImpl implements FileDomainService {

	// 내부 상수: 최대 파일 크기 (5MB)
	private static final long MAX_FILE_SIZE = 5 * 1024 * 1024;

	// 허용하는 파일 확장자 목록 (소문자)
	private static final List<String> ALLOWED_EXTENSIONS = Arrays.asList("jpg", "jpeg", "png");

	// 허용하는 MIME 타입 목록
	private static final List<String> ALLOWED_MIME_TYPES = Arrays.asList("image/jpeg", "image/png");

	@Override
	public File createFile(String path, FileType type, String referenceEntityType, Integer referenceEntityId) {
		return File.builder()
			.path(path)
			.type(type)
			.referenceEntityType(referenceEntityType)
			.referenceEntityId(referenceEntityId)
			.build();
	}

	/**
	 * 이미지 파일 검증 메소드
	 *
	 * @param file 검증할 MultipartFile
	 * @throws CustomException 유효하지 않은 파일일 경우 발생
	 */
	public void validateImageFile(MultipartFile file) {
		// 1. 파일이 비어있는지 확인
		if (file == null || file.isEmpty()) {
			throw new CustomException(ErrorCode.FILE_EMPTY);
		}

		// 2. 파일 크기 검증
		if (file.getSize() > MAX_FILE_SIZE) {
			throw new CustomException(ErrorCode.FILE_TOO_LARGE);
		}

		// 3. 파일 이름 및 확장자 검증
		String originalFilename = file.getOriginalFilename();
		if (originalFilename == null || !originalFilename.contains(".")) {
			throw new CustomException(ErrorCode.FILE_INVALID_NAME);
		}

		String extension = originalFilename.substring(originalFilename.lastIndexOf(".") + 1).toLowerCase();
		if (!ALLOWED_EXTENSIONS.contains(extension)) {
			throw new CustomException(ErrorCode.FILE_INVALID_EXTENSION);
		}

		// 4. MIME 타입 검증
		String contentType = file.getContentType();
		if (contentType == null || !ALLOWED_MIME_TYPES.contains(contentType)) {
			throw new CustomException(ErrorCode.FILE_INVALID_MIME_TYPE);
		}

		// 5. 매직 넘버(파일 헤더) 검증
		try (InputStream is = file.getInputStream()) {
			// 충분한 크기의 헤더 버퍼 (JPEG: 3바이트, PNG: 8바이트)
			byte[] header = new byte[8];
			int readBytes = is.read(header, 0, header.length);
			if (readBytes < 8) {
				throw new CustomException(ErrorCode.FILE_INVALID_CONTENT);
			}

			boolean validMagic = isValidMagic(extension, header);
			if (!validMagic) {
				throw new CustomException(ErrorCode.FILE_INVALID_CONTENT);
			}
		} catch (IOException e) {
			throw new CustomException(ErrorCode.FILE_PROCESSING_ERROR);
		}
	}

	/**
	 * 파일 매직 넘버 검증
	 */
	private boolean isValidMagic(String extension, byte[] header) {
		boolean validMagic = false;

		if (extension.equals("jpg") || extension.equals("jpeg")) {
			// JPEG 파일은 일반적으로 FF D8 FF 로 시작합니다.
			validMagic = (header[0] & 0xFF) == 0xFF
				&& (header[1] & 0xFF) == 0xD8
				&& (header[2] & 0xFF) == 0xFF;
		} else if (extension.equals("png")) {
			// PNG 파일의 매직 넘버: 89 50 4E 47 0D 0A 1A 0A
			validMagic = (header[0] & 0xFF) == 0x89
				&& (header[1] & 0xFF) == 0x50
				&& (header[2] & 0xFF) == 0x4E
				&& (header[3] & 0xFF) == 0x47
				&& (header[4] & 0xFF) == 0x0D
				&& (header[5] & 0xFF) == 0x0A
				&& (header[6] & 0xFF) == 0x1A
				&& (header[7] & 0xFF) == 0x0A;
		}

		return validMagic;
	}
}