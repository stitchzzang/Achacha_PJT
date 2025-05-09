package com.eurachacha.achacha.infrastructure.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import lombok.Getter;
import lombok.Setter;

@Component
@ConfigurationProperties(prefix = "jwt")
@Getter
@Setter
public class JwtProperties {
	private String secret;
	private long accessTokenExpirySeconds;
	private long refreshTokenExpirySeconds;
}